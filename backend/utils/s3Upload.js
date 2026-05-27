// utils/upload.js
const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
  } = require("@aws-sdk/client-s3");
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  const mime = require("mime-types");
  
  // ==================== S3 CLIENT ====================
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  const BUCKET_NAME = process.env.S3_BUCKET_NAME;
  
  if (!BUCKET_NAME) {
    console.error("⚠️ S3_BUCKET_NAME environment variable is not set!");
  }
  
  // ==================== UPLOAD FUNCTIONS ====================
  
  /**
   * Upload base64 image to S3
   * @param {string} base64Data - Base64 string with data:image/... prefix
   * @param {string} folder - Folder path in S3 bucket
   * @returns {Promise<{key: string}>} - S3 object key
   */
  const uploadBase64ToS3 = async (base64Data, folder) => {
    try {
      if (!base64Data || !base64Data.startsWith("data:")) {
        console.error("Invalid base64 data provided");
        return null;
      }
  
      const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/);
      if (!matches) {
        console.error("Invalid base64 format");
        return null;
      }
  
      const mimeType = matches[1];
      const base64String = matches[2];
      const buffer = Buffer.from(base64String, "base64");
      const extension = mime.extension(mimeType) || "jpg";
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const key = `${folder}/${timestamp}-${random}.${extension}`;
  
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: "max-age=31536000", // 1 year cache
      });
  
      await s3Client.send(command);
      console.log(`✅ Uploaded to S3: ${key}`);
  
      return { key };
    } catch (error) {
      console.error("❌ S3 Upload Error:", error.message);
      return null;
    }
  };
  
  /**
   * Upload buffer to S3
   * @param {Buffer} buffer - File buffer
   * @param {string} mimeType - MIME type of the file
   * @param {string} folder - Folder path in S3 bucket
   * @returns {Promise<{key: string}>} - S3 object key
   */
  const uploadBufferToS3 = async (buffer, mimeType, folder) => {
    try {
      if (!buffer || !mimeType || !folder) {
        console.error("Missing required parameters for uploadBufferToS3");
        return null;
      }
  
      const extension = mime.extension(mimeType) || "bin";
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const key = `${folder}/${timestamp}-${random}.${extension}`;
  
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: "max-age=31536000",
      });
  
      await s3Client.send(command);
      console.log(`✅ Uploaded buffer to S3: ${key}`);
  
      return { key };
    } catch (error) {
      console.error("❌ S3 Upload Buffer Error:", error.message);
      return null;
    }
  };
  
  /**
   * Upload a file from disk path to S3
   * @param {string} filePath - Path to file on disk
   * @param {string} contentType - MIME type
   * @param {string} folder - Folder path in S3 bucket
   * @returns {Promise<{key: string}>} - S3 object key
   */
  const uploadFileToS3 = async (filePath, contentType, folder) => {
    try {
      const fs = require("fs");
      const buffer = fs.readFileSync(filePath);
      const filename = path.basename(filePath);
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const key = `${folder}/${timestamp}-${random}-${filename}`;
  
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });
  
      await s3Client.send(command);
      console.log(`✅ Uploaded file to S3: ${key}`);
  
      return { key };
    } catch (error) {
      console.error("❌ S3 Upload File Error:", error.message);
      return null;
    }
  };
  
  /**
   * Upload multiple base64 images to S3
   * @param {string[]} base64Array - Array of base64 strings
   * @param {string} folder - Folder path in S3 bucket
   * @returns {Promise<Array<{key: string}>>} - Array of S3 object keys
   */
  const uploadMultipleToS3 = async (base64Array, folder) => {
    if (!Array.isArray(base64Array) || base64Array.length === 0) {
      return [];
    }
  
    const uploadPromises = base64Array.map(async (base64String) => {
      try {
        return await uploadBase64ToS3(base64String, folder);
      } catch (err) {
        console.error("Failed to upload individual image:", err.message);
        return null;
      }
    });
  
    const results = await Promise.all(uploadPromises);
    return results.filter(Boolean);
  };
  
  // ==================== DELETE FUNCTIONS ====================
  
  /**
   * Delete a file from S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} - Success status
   */
  const deleteFromS3 = async (key) => {
    if (!key) {
      console.warn("No S3 key provided for deletion");
      return false;
    }
  
    try {
      const command = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
  
      await s3Client.send(command);
      console.log(`✅ Deleted from S3: ${key}`);
      return true;
    } catch (error) {
      console.error(`❌ S3 Delete Error for ${key}:`, error.message);
      return false;
    }
  };
  
  /**
   * Delete multiple files from S3
   * @param {string[]} keys - Array of S3 object keys
   * @returns {Promise<{success: string[], failed: string[]}>} - Results
   */
  const deleteMultipleFromS3 = async (keys) => {
    if (!keys || keys.length === 0) {
      return { success: [], failed: [] };
    }
  
    const results = { success: [], failed: [] };
    
    const deletePromises = keys.map(async (key) => {
      const deleted = await deleteFromS3(key);
      if (deleted) {
        results.success.push(key);
      } else {
        results.failed.push(key);
      }
    });
  
    await Promise.all(deletePromises);
    return results;
  };
  
  // ==================== SIGNED URL FUNCTIONS ====================
  
  /**
   * Get signed URL for a file in S3
   * @param {string} key - S3 object key
   * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
   * @returns {Promise<string|null>} - Signed URL or null
   */
  const getSignedFileUrl = async (key, expiresIn = 3600) => {
    if (!key) {
      console.warn("No S3 key provided for signed URL");
      return null;
    }
  
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
  
      const url = await getSignedUrl(s3Client, command, { expiresIn });
      console.log(`🔗 Generated signed URL for ${key} (expires in ${expiresIn}s)`);
      return url;
    } catch (error) {
      console.error(`❌ S3 Get Signed URL Error for ${key}:`, error.message);
      return null;
    }
  };
  
  /**
   * Get multiple signed URLs
   * @param {string[]} keys - Array of S3 object keys
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<Object>} - Object mapping keys to signed URLs
   */
  const getBatchSignedUrls = async (keys, expiresIn = 3600) => {
    if (!keys || keys.length === 0) {
      return {};
    }
  
    const urlPromises = keys.map(async (key) => {
      const url = await getSignedFileUrl(key, expiresIn);
      return { key, url };
    });
  
    const results = await Promise.all(urlPromises);
    const urlMap = {};
    
    results.forEach(({ key, url }) => {
      if (url) {
        urlMap[key] = url;
      }
    });
  
    return urlMap;
  };
  
  // ==================== UTILITY FUNCTIONS ====================
  
  /**
   * Check if a file exists in S3
   * @param {string} key - S3 object key
   * @returns {Promise<boolean>} - True if exists
   */
  const fileExistsInS3 = async (key) => {
    if (!key) return false;
  
    try {
      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      
      await s3Client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      console.error(`Error checking S3 file existence: ${error.message}`);
      return false;
    }
  };
  
  /**
   * Generate a signed URL for direct upload (if using presigned POST)
   * @param {string} key - S3 object key
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<string|null>} - Presigned URL for PUT
   */
  const getPresignedUploadUrl = async (key, expiresIn = 3600) => {
    if (!key) return null;
  
    try {
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
  
      const url = await getSignedUrl(s3Client, command, { expiresIn });
      return url;
    } catch (error) {
      console.error(`Error generating presigned upload URL:`, error.message);
      return null;
    }
  };
  
  // ==================== EXPORTS ====================
  module.exports = {
    // Upload functions
    uploadBase64ToS3,
    uploadBufferToS3,
    uploadFileToS3,
    uploadMultipleToS3,
    
    // Delete functions
    deleteFromS3,
    deleteMultipleFromS3,
    
    // Signed URL functions
    getSignedFileUrl,
    getBatchSignedUrls,
    
    // Utility functions
    fileExistsInS3,
    getPresignedUploadUrl,
    
    // Client (if needed directly)
    s3Client,
    BUCKET_NAME,
  };