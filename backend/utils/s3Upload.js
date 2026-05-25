const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand
  } = require("@aws-sdk/client-s3");
  
  const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
  
  // ===================== S3 CLIENT =====================
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  const BUCKET_NAME = process.env.S3_BUCKET_NAME;
  
  // ===================== UPLOAD BASE64 =====================
  const uploadBase64ToS3 = async (base64Data, folder = "uploads") => {
    try {
      console.log("🔍 Upload starting...");
  
      if (!base64Data || !base64Data.startsWith("data:")) {
        throw new Error("Invalid base64 data");
      }
  
      // Extract base64
      const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/);
      if (!matches) {
        throw new Error("Invalid base64 format");
      }
  
      const mimeType = matches[1];
      const base64String = matches[2];
      const buffer = Buffer.from(base64String, "base64");
  
      // Generate unique S3 key
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const extension = mimeType.split("/")[1] || "jpg";
  
      const key = `${folder}/${timestamp}-${random}.${extension}`;
  
      console.log("📦 Uploading to S3 key:", key);
  
      // Upload to S3 (PRIVATE by default)
      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        CacheControl: "max-age=31536000",
      });
  
      await s3Client.send(command);
  
      console.log("✅ Upload successful");
  
      // ❌ IMPORTANT: DO NOT RETURN PUBLIC URL
      // ✅ ONLY return key
  
      return {
        key, // 👈 SAVE THIS IN DATABASE
      };
  
    } catch (error) {
      console.error("❌ S3 Upload Error:", error.message);
      throw error;
    }
  };
  
  // ===================== DELETE FILE =====================
  const deleteFromS3 = async (key) => {
    if (!key) return;
  
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
  
    await s3Client.send(command);
    return true;
  };
  
  // ===================== GET SIGNED URL (FOR FRONTEND) =====================
  const getSignedFileUrl = async (key, expiresIn = 300) => {
    if (!key) return null;
  
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
  
    const url = await getSignedUrl(s3Client, command, {
      expiresIn, // seconds (5 min default)
    });
  
    return url;
  };
  
  module.exports = {
    uploadBase64ToS3,
    deleteFromS3,
    getSignedFileUrl,
  };