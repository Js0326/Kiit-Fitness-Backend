'use strict';
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ── Use memory storage — we upload buffer directly to Cloudinary ──
const memStorage = multer.memoryStorage();

const uploadGymImage       = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadComplaintImage = multer({ storage: memStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Upload a buffer to Cloudinary ─────────────────────────────────
const uploadBuffer = (buffer, folder, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, ...options, transformation: [{ width: 1200, crop: 'limit', quality: 'auto:good' }] },
      (err, result) => { if (err) reject(err); else resolve(result); }
    );
    stream.end(buffer);
  });

const deleteImage = async (publicId) => {
  try { await cloudinary.uploader.destroy(publicId); }
  catch (e) { console.error('Cloudinary delete error:', e.message); }
};

module.exports = { cloudinary, uploadGymImage, uploadComplaintImage, uploadBuffer, deleteImage };
