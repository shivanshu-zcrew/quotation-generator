import { useState, useEffect } from 'react';
import { quotationAPI } from '../services/api';

// Cache singleton
const urlCache = new Map();
const pendingRequests = new Map();

export const useS3Image = (s3Key, expiresIn = 3600) => {
  const [imageUrl, setImageUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!s3Key) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const cacheKey = `${s3Key}_${expiresIn}`;

    const loadImage = async () => {
      // Check cache
      if (urlCache.has(cacheKey)) {
        setImageUrl(urlCache.get(cacheKey));
        setLoading(false);
        return;
      }

      // Check if already fetching
      if (pendingRequests.has(cacheKey)) {
        try {
          const url = await pendingRequests.get(cacheKey);
          if (isMounted) setImageUrl(url);
        } catch (err) {
          if (isMounted) setError(err);
        } finally {
          if (isMounted) setLoading(false);
        }
        return;
      }

      // Fetch new URL
      const promise = quotationAPI.getSignedUrl(s3Key, expiresIn)
        .then(response => {
          const url = response.data.url;
          urlCache.set(cacheKey, url);
          setTimeout(() => urlCache.delete(cacheKey), expiresIn * 1000);
          return url;
        });

      pendingRequests.set(cacheKey, promise);

      try {
        const url = await promise;
        if (isMounted) setImageUrl(url);
      } catch (err) {
        if (isMounted) setError(err);
      } finally {
        pendingRequests.delete(cacheKey);
        if (isMounted) setLoading(false);
      }
    };

    loadImage();
  }, [s3Key, expiresIn]);

  return { imageUrl, loading, error };
};

export const useS3Images = (s3Keys, expiresIn = 3600) => {
  const [imageUrls, setImageUrls] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!s3Keys || s3Keys.length === 0) {
      setImageUrls({});
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadImages = async () => {
      const uncachedKeys = s3Keys.filter(key => !urlCache.has(`${key}_${expiresIn}`));
      
      if (uncachedKeys.length > 0) {
        try {
          const response = await quotationAPI.getBatchSignedUrls(uncachedKeys, expiresIn);
          const newUrls = response.data.urls;
          
          // Cache new URLs
          Object.entries(newUrls).forEach(([key, url]) => {
            const cacheKey = `${key}_${expiresIn}`;
            urlCache.set(cacheKey, url);
            setTimeout(() => urlCache.delete(cacheKey), expiresIn * 1000);
          });
        } catch (err) {
          if (isMounted) setError(err);
        }
      }
      
      // Get all URLs from cache
      const results = {};
      s3Keys.forEach(key => {
        const cacheKey = `${key}_${expiresIn}`;
        results[key] = urlCache.get(cacheKey);
      });
      
      if (isMounted) {
        setImageUrls(results);
        setLoading(false);
      }
    };

    loadImages();
  }, [JSON.stringify(s3Keys), expiresIn]);

  return { imageUrls, loading, error };
};

// Helper function for non-React usage
export const convertS3KeyToUrl = async (s3Key, expiresIn = 3600) => {
  if (!s3Key) return null;
  
  const cacheKey = `${s3Key}_${expiresIn}`;
  if (urlCache.has(cacheKey)) {
    return urlCache.get(cacheKey);
  }
  
  try {
    const response = await quotationAPI.getSignedUrl(s3Key, expiresIn);
    const signedUrl = response.data.url;
    urlCache.set(cacheKey, signedUrl);
    setTimeout(() => urlCache.delete(cacheKey), expiresIn * 1000);
    return signedUrl;
  } catch (error) {
    console.error('Failed to get signed URL for S3 key:', s3Key, error);
    return null;
  }
};

export const convertBatchS3KeysToUrls = async (s3Keys, expiresIn = 3600) => {
  if (!s3Keys || s3Keys.length === 0) return {};
  
  const uncachedKeys = s3Keys.filter(key => !urlCache.has(`${key}_${expiresIn}`));
  
  if (uncachedKeys.length > 0) {
    try {
      const response = await quotationAPI.getBatchSignedUrls(uncachedKeys, expiresIn);
      const urls = response.data.urls;
      
      Object.entries(urls).forEach(([key, url]) => {
        const cacheKey = `${key}_${expiresIn}`;
        urlCache.set(cacheKey, url);
        setTimeout(() => urlCache.delete(cacheKey), expiresIn * 1000);
      });
    } catch (error) {
      console.error('Failed to get batch signed URLs:', error);
    }
  }
  
  const result = {};
  s3Keys.forEach(key => {
    const cacheKey = `${key}_${expiresIn}`;
    result[key] = urlCache.get(cacheKey);
  });
  return result;
};