import React, { useState } from 'react';
import { useS3Image } from '../hooks/useS3Image';

export const S3Image = ({ 
  s3Key, 
  alt, 
  className, 
  style, 
  expiresIn = 3600, 
  fallbackSrc,
  onLoad,
  onError 
}) => {
  const { imageUrl, loading, error } = useS3Image(s3Key, expiresIn);
  const [imgError, setImgError] = useState(false);

  if (loading) {
    return <div className="s3-image-loading">Loading...</div>;
  }

  if (error || imgError || !imageUrl) {
    if (fallbackSrc) {
      return <img src={fallbackSrc} alt={alt} className={className} style={style} />;
    }
    return <div className="s3-image-error">Failed to load image</div>;
  }

  return (
    <img 
      src={imageUrl} 
      alt={alt} 
      className={className} 
      style={style}
      onLoad={onLoad}
      onError={(e) => {
        setImgError(true);
        if (onError) onError(e);
      }}
    />
  );
};

export const S3ImageGallery = ({ s3Keys, alt, className, expiresIn = 3600 }) => {
  const [loadedUrls, setLoadedUrls] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImages = async () => {
      const urls = await convertBatchS3KeysToUrls(s3Keys, expiresIn);
      setLoadedUrls(urls);
      setLoading(false);
    };
    
    if (s3Keys && s3Keys.length > 0) {
      loadImages();
    }
  }, [s3Keys, expiresIn]);

  if (loading) {
    return <div>Loading {s3Keys.length} images...</div>;
  }

  return (
    <div className="s3-image-gallery">
      {s3Keys.map((key, index) => (
        loadedUrls[key] && (
          <img 
            key={key}
            src={loadedUrls[key]} 
            alt={`${alt} ${index + 1}`}
            className={className}
          />
        )
      ))}
    </div>
  );
};