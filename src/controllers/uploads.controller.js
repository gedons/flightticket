// src/controllers/uploads.controller.js
const streamifier = require('streamifier');
const cloudinary = require('../config/cloudinary'); // ensure this file exists and exports configured cloudinary

function uploadBufferToCloudinary(buffer, folder = 'shipments', publicIdBase = null, resourceType = 'image') {
  return new Promise((resolve, reject) => {
    const opts = { folder, resource_type: resourceType };
    if (publicIdBase) opts.public_id = publicIdBase;
    const uploadStream = cloudinary.uploader.upload_stream(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

async function uploadFile(req, res, next) {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const folder = process.env.CLOUDINARY_FOLDER || 'shipments';
    const publicIdBase = `shipment_${Date.now()}`;
    const result = await uploadBufferToCloudinary(req.file.buffer, folder, publicIdBase, 'image');

    const out = {
      url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      bytes: result.bytes,
      raw: result
    };
    res.json({ upload: out });
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadFile };
