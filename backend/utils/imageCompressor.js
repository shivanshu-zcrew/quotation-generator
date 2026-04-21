// utils/imageCompressor.js
const sharp = require('sharp');

class ImageCompressor {
  constructor(options = {}) {
    this.maxWidth = options.maxWidth || 1200;
    this.maxHeight = options.maxHeight || 1200;
    this.quality = options.quality || 75;
    this.maxSizeKB = options.maxSizeKB || 500;
  }

  /**
   * Compress a single base64 image
   */
  async compressBase64Image(base64String, options = {}) {
    try {
      // Skip if not a base64 image
      if (!base64String || !base64String.startsWith('data:image')) {
        return base64String;
      }

      const matches = base64String.match(/^data:([^;]+);base64,(.*)$/s);
      if (!matches) return base64String;

      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');

      // Check if compression is needed
      const originalSizeKB = buffer.length / 1024;
      if (originalSizeKB <= this.maxSizeKB && !options.force) {
        console.log(`📸 Image already optimized: ${originalSizeKB.toFixed(1)}KB`);
        return base64String;
      }

      // Start compression
      let sharpInstance = sharp(buffer);
      const metadata = await sharpInstance.metadata();

      // Resize if needed
      let width = metadata.width;
      let height = metadata.height;
      
      const maxW = options.maxWidth || this.maxWidth;
      const maxH = options.maxHeight || this.maxHeight;
      
      if (width > maxW || height > maxH) {
        sharpInstance = sharpInstance.resize(maxW, maxH, {
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      // Determine output format and compress
      let outputBuffer;
      let outputMimeType = mimeType;
      const quality = options.quality || this.quality;

      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        outputBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
      } else if (mimeType.includes('png')) {
        outputBuffer = await sharpInstance.png({ quality, compressionLevel: 9 }).toBuffer();
      } else if (mimeType.includes('webp')) {
        outputBuffer = await sharpInstance.webp({ quality }).toBuffer();
      } else {
        // Convert other formats to JPEG
        outputBuffer = await sharpInstance.jpeg({ quality }).toBuffer();
        outputMimeType = 'image/jpeg';
      }

      // Convert back to base64
      const compressedBase64 = `data:${outputMimeType};base64,${outputBuffer.toString('base64')}`;
      const compressedSizeKB = outputBuffer.length / 1024;
      const reduction = ((1 - outputBuffer.length / buffer.length) * 100).toFixed(1);

      console.log(`📸 Compressed: ${originalSizeKB.toFixed(1)}KB → ${compressedSizeKB.toFixed(1)}KB (${reduction}% reduction)`);

      return compressedBase64;

    } catch (error) {
      console.error('Image compression error:', error);
      return base64String; // Return original on error
    }
  }

  /**
   * Compress multiple base64 images
   */
  async compressImages(images, options = {}) {
    if (!images || !Array.isArray(images)) return images;
    
    const compressed = await Promise.all(
      images.map(async (image, index) => {
        if (typeof image === 'string' && image.startsWith('data:image')) {
          return await this.compressBase64Image(image, options);
        }
        return image;
      })
    );
    
    return compressed;
  }

  /**
   * Compress quotationImages object
   */
  async compressQuotationImages(quotationImages, options = {}) {
    if (!quotationImages || typeof quotationImages !== 'object') return quotationImages;
    
    const compressed = {};
    
    for (const [key, images] of Object.entries(quotationImages)) {
      if (Array.isArray(images)) {
        compressed[key] = await this.compressImages(images, options);
      } else {
        compressed[key] = images;
      }
    }
    
    return compressed;
  }

  /**
   * Compress terms images
   */
  async compressTermsImages(termsImages, options = {}) {
    if (!termsImages || !Array.isArray(termsImages)) return termsImages;
    
    const compressed = await Promise.all(
      termsImages.map(async (img) => {
        if (img.base64 && typeof img.base64 === 'string' && img.base64.startsWith('data:image')) {
          const compressedBase64 = await this.compressBase64Image(img.base64, options);
          return { ...img, base64: compressedBase64 };
        }
        return img;
      })
    );
    
    return compressed;
  }

  /**
   * Compress internal documents that are images
   */
  async compressInternalDocuments(documents, options = {}) {
    if (!documents || !Array.isArray(documents)) return documents;
    
    const compressed = await Promise.all(
      documents.map(async (doc) => {
        if (doc.fileData && typeof doc.fileData === 'string' && doc.fileData.startsWith('data:image')) {
          const compressedFileData = await this.compressBase64Image(doc.fileData, options);
          return { ...doc, fileData: compressedFileData };
        }
        return doc;
      })
    );
    
    return compressed;
  }
}

module.exports = new ImageCompressor();