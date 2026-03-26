'use strict';
const { db } = require('../firebase/admin');

exports.getAllGyms = async (req, res) => {
  const { gender } = req.query;
  let snap = await db.collection('gyms').get();
  let gyms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (gender) gyms = gyms.filter(g => g.gender === gender || g.gender === 'both');
  res.json(gyms);
};

exports.getGym = async (req, res) => {
  const doc = await db.collection('gyms').doc(req.params.gymId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Gym not found' });
  res.json({ id: doc.id, ...doc.data() });
};

exports.updateGym = async (req, res) => {
  const { gymId } = req.params;
  const allowed = ['name', 'description', 'equipment', 'images', 'trainers', 'staff',
                   'capacityPerSlot', 'announcements', 'mapLink', 'location', 'gender'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updatedAt = Date.now();
  await db.collection('gyms').doc(gymId).update(updates);
  res.json({ message: 'Gym updated' });
};

exports.getSlotAvailability = async (req, res) => {
  const { gymId } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date required' });

  const gymDoc = await db.collection('gyms').doc(gymId).get();
  if (!gymDoc.exists) return res.status(404).json({ error: 'Gym not found' });
  const capacity = gymDoc.data().capacityPerSlot || 20;

  const snap = await db.collection('bookings')
    .where('gymId', '==', gymId).where('date', '==', date)
    .where('status', 'in', ['booked', 'attended']).get();

  const counts = {};
  snap.forEach(doc => {
    const { slot } = doc.data();
    counts[slot] = (counts[slot] || 0) + 1;
  });
  res.json({ date, gymId, capacity, counts });
};
