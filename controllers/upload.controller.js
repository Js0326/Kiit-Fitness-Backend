'use strict';
const { db }          = require('../firebase/admin');
const { uploadBuffer, deleteImage } = require('../services/cloudinary.service');

// ── Upload gym image ───────────────────────────────────────────────
exports.uploadGymImage = async (req, res) => {
  const { gymId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  try {
    const result = await uploadBuffer(req.file.buffer, 'kiit-gym/gyms');
    const imageData = {
      url:        result.secure_url,
      publicId:   result.public_id,
      caption:    req.body.caption || '',
      uploadedAt: Date.now(),
      uploadedBy: req.user.uid,
    };

    const gymRef = db.collection('gyms').doc(gymId);
    const gymDoc = await gymRef.get();
    if (!gymDoc.exists) return res.status(404).json({ error: 'Gym not found' });

    const existing = gymDoc.data().images || [];
    await gymRef.update({ images: [...existing, imageData] });
    res.json({ message: 'Image uploaded', image: imageData });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};

// ── Delete gym image ───────────────────────────────────────────────
exports.deleteGymImage = async (req, res) => {
  const { gymId, publicId } = req.params;
  const decoded = decodeURIComponent(publicId);

  await deleteImage(decoded);

  const gymRef = db.collection('gyms').doc(gymId);
  const gymDoc = await gymRef.get();
  if (!gymDoc.exists) return res.status(404).json({ error: 'Gym not found' });

  const images = (gymDoc.data().images || []).filter(img => img.publicId !== decoded);
  await gymRef.update({ images });
  res.json({ message: 'Image deleted' });
};

// ── Upload complaint image ─────────────────────────────────────────
exports.uploadComplaintImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  try {
    const result = await uploadBuffer(req.file.buffer, 'kiit-gym/complaints');
    res.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed: ' + err.message });
  }
};
