require('dotenv').config();         

const cloudinary = require('cloudinary').v2;

const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const api_key    = process.env.CLOUDINARY_API_KEY?.trim();
const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();

// Fail fast with a clear message instead of a cryptic 401 from Cloudinary
if (!cloud_name || !api_key || !api_secret) {
  throw new Error(
    'Missing Cloudinary credentials. Make sure CLOUDINARY_CLOUD_NAME, ' +
    'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in your .env file.'
  );
}

cloudinary.config({ cloud_name, api_key, api_secret });

module.exports = cloudinary;