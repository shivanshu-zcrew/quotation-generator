import { quotationAPI } from '../api/quotations';

class S3Service {
  constructor() {
    this.cache = new Map();
  }

  async getSignedUrl(s3Key, expiresIn = 3600) {
    const cacheKey = `${s3Key}_${expiresIn}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await quotationAPI.getSignedUrl(s3Key, expiresIn);
    const url = response.data.url;
    
    this.cache.set(cacheKey, url);
    setTimeout(() => this.cache.delete(cacheKey), expiresIn * 1000);
    
    return url;
  }

  async getBatchSignedUrls(s3Keys, expiresIn = 3600) {
    const response = await quotationAPI.getBatchSignedUrls(s3Keys, expiresIn);
    return response.data.urls;
  }

  clearCache(s3Key = null) {
    if (s3Key) {
      for (const [key] of this.cache) {
        if (key.startsWith(s3Key)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }
}

export const s3Service = new S3Service();