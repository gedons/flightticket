// src/services/cloudinary.service.js
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Upload a Buffer (image/pdf) to Cloudinary using upload_stream.
 * options: folder, public_id (optional), resource_type ('image'|'raw'|'auto')
 */
exports.uploadBuffer = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: options.folder || process.env.CLOUDINARY_UPLOAD_FOLDER || 'tickets',
      public_id: options.public_id,
      resource_type: options.resource_type || 'image',
      overwrite: true,
      use_filename: true,
      unique_filename: false // keep consistent names if public_id provided
    };

    // If caller provided format (e.g., 'pdf'), pass it through so Cloudinary returns a .pdf URL
    if (options.format) uploadOptions.format = options.format;

    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};