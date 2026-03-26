'use strict';
const { db } = require('../firebase/admin');
const { deleteImage } = require('../services/cloudinary.service');

// Upload gym image
exports.uploadGymImage = async (req, res) => {
  const { gymId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const imageData = {
    url:        req.file.path,
    publicId:   req.file.filename,
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
};

// Delete gym image
exports.deleteGymImage = async (req, res) => {
  const { gymId, publicId } = req.params;
  const decodedId = decodeURIComponent(publicId);
  await deleteImage(decodedId);

  const gymRef = db.collection('gyms').doc(gymId);
  const gymDoc = await gymRef.get();
  if (!gymDoc.exists) return res.status(404).json({ error: 'Gym not found' });

  const images = (gymDoc.data().images || []).filter(img => img.publicId !== decodedId);
  await gymRef.update({ images });
  res.json({ message: 'Image deleted' });
};

// Upload complaint image — returns URL for frontend to attach to complaint
exports.uploadComplaintImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  res.json({ url: req.file.path, publicId: req.file.filename });
};
