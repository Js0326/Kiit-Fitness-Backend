'use strict';
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ── Gym images storage ────────────────────────────────────────────
const gymStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'kiit-gym/gyms',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 800, crop: 'limit', quality: 'auto:good' }],
  },
});

// ── Complaint images storage ──────────────────────────────────────
const complaintStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:         'kiit-gym/complaints',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1024, height: 1024, crop: 'limit', quality: 'auto:good' }],
  },
});

// ── Multer upload instances ───────────────────────────────────────
const uploadGymImage       = multer({ storage: gymStorage,       limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB
const uploadComplaintImage = multer({ storage: complaintStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── Delete image from Cloudinary ─────────────────────────────────
const deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Cloudinary delete error:', err.message);
  }
};

module.exports = { cloudinary, uploadGymImage, uploadComplaintImage, deleteImage };
