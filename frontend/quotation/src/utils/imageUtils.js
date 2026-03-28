const imageCache = new Map();

export const imageToBase64 = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  if (src.startsWith('data:')) return resolve(src);
  if (imageCache.has(src)) return resolve(imageCache.get(src));
  
  const img = new Image();
  img.crossOrigin = 'Anonymous';
  const timer = setTimeout(() => resolve(null), 8000);
  
  img.onload = () => {
    clearTimeout(timer);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const b64 = canvas.toDataURL('image/png');
      imageCache.set(src, b64);
      resolve(b64);
    } catch {
      resolve(null);
    }
  };
  
  img.onerror = () => {
    clearTimeout(timer);
    resolve(null);
  };
  
  img.src = src;
});