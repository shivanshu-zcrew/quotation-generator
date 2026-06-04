 
import { quotationAPI } from '../services/api';
 
export async function compressImage(file, { maxWidth = 800, maxHeight = 800, quality = 0.7 } = {}) {

  if (file.type === 'image/gif') {
    return { blob: file, contentType: file.type };
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = dataUrl;
  });

  let { width, height } = img;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

 
  const outType = 'image/jpeg';
  const blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), outType, quality)
  );

 
  if (blob && blob.size < file.size) {
    return { blob, contentType: outType };
  }
  return { blob: file, contentType: file.type };
}

 
export async function uploadItemImage(file, itemIndex) {
  const { blob, contentType } = await compressImage(file);

  // 1) Ask the server for a presigned PUT URL.
  const presignRes = await quotationAPI.presignItemImage(
    contentType,
    file.name,
    itemIndex,
    blob.size
  );
  const { uploadUrl, key } = presignRes.data || {};
  if (!uploadUrl || !key) {
    throw new Error('Failed to get upload URL');
  }

   const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob,
  });

  if (!putRes.ok) {
    throw new Error(`S3 upload failed (${putRes.status})`);
  }

   return key;
}

export async function uploadTermsImage(file) {
    const { blob, contentType } = await compressImage(file);
  
    const presignRes = await quotationAPI.presignItemImage(
      contentType, file.name, undefined, blob.size, 'terms'
    );
    const { uploadUrl, key } = presignRes.data || {};
    if (!uploadUrl || !key) throw new Error('Failed to get upload URL');
  
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    if (!putRes.ok) throw new Error(`S3 upload failed (${putRes.status})`);
  
    return key;
  }