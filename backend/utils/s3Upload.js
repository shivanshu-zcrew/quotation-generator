const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 Client with credentials
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

// Upload base64 image to S3
const uploadBase64ToS3 = async (base64Data, folder) => {
    console.log('🔍 [S3] Starting upload...');
    console.log('🔍 [S3] base64Data length:', base64Data?.length);
    console.log('🔍 [S3] base64Data starts with data:image?', base64Data?.startsWith('data:'));
    
    if (!base64Data || !base64Data.startsWith('data:')) {
      console.log('❌ [S3] Invalid data format - not starting with data:');
      return null;
    }
    
    // Extract base64 data
    const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/);
    if (!matches) {
      console.log('❌ [S3] Failed to parse base64 - no match found');
      return null;
    }
    
    const mimeType = matches[1];
    const base64String = matches[2];
    const buffer = Buffer.from(base64String, 'base64');
    
    console.log('🔍 [S3] Mime type:', mimeType);
    console.log('🔍 [S3] Buffer size:', buffer.length);
    
    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = mimeType.split('/')[1] || 'jpg';
    const key = `${folder}/${timestamp}-${random}.${extension}`;
    
    console.log('🔍 [S3] Generated key:', key);
    console.log('🔍 [S3] Bucket:', BUCKET_NAME);
    console.log('🔍 [S3] Region:', process.env.AWS_REGION);
    
    // Upload to S3 with public read access
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'max-age=31536000',
     });
    
    try {
      console.log('📤 [S3] Sending upload command...');
      const result = await s3Client.send(command);
      console.log('✅ [S3] Upload successful:', result);
      
      // Construct the URL
      const url = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${key}`;
      console.log('✅ [S3] File URL:', url);
      
      return {
        url: url,
        publicId: key,
      };
    } catch (error) {
      console.error('❌ [S3] Upload failed:', error.message);
      console.error('❌ [S3] Error details:', error);
      return null;
    }
  };

// Delete file from S3
const deleteFromS3 = async (publicId) => {
  if (!publicId) return;
  
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: publicId,
  });
  
  await s3Client.send(command);
  return true;
};

// Generate signed URL for private files (optional)
const getSignedFileUrl = async (key, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
};

module.exports = { uploadBase64ToS3, deleteFromS3, getSignedFileUrl };