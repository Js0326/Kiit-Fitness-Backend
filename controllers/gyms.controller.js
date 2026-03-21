const { db } = require('../firebase/admin');

// ─── GET ALL GYMS ────────────────────────────────────────────────
exports.getAllGyms = async (req, res) => {
  const { gender } = req.query;
  let query = db.collection('gyms');
  if (gender) query = query.where('gender', 'in', [gender, 'both']);
  const snap = await query.get();
  const gyms = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json(gyms);
};

// ─── GET ONE GYM ─────────────────────────────────────────────────
exports.getGym = async (req, res) => {
  const doc = await db.collection('gyms').doc(req.params.gymId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Gym not found' });
  res.json({ id: doc.id, ...doc.data() });
};

// ─── UPDATE GYM INFO (admin) ─────────────────────────────────────
exports.updateGym = async (req, res) => {
  const { gymId } = req.params;
  const allowed = ['name', 'description', 'equipment', 'images', 'trainers', 'staff', 'capacityPerSlot', 'announcements'];
  const updates = {};
  allowed.forEach((key) => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
  updates.updatedAt = Date.now();
  await db.collection('gyms').doc(gymId).update(updates);
  res.json({ message: 'Gym updated successfully' });
};

// ─── GET SLOT AVAILABILITY ───────────────────────────────────────
exports.getSlotAvailability = async (req, res) => {
  const { gymId } = req.params;
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD)' });

  const gymDoc = await db.collection('gyms').doc(gymId).get();
  if (!gymDoc.exists) return res.status(404).json({ error: 'Gym not found' });
  const capacity = gymDoc.data().capacityPerSlot || 20;

  const snap = await db.collection('bookings')
    .where('gymId', '==', gymId)
    .where('date', '==', date)
    .where('status', 'in', ['booked', 'attended'])
    .get();

  const counts = {};
  snap.forEach((doc) => {
    const { slot } = doc.data();
    counts[slot] = (counts[slot] || 0) + 1;
  });

  res.json({ date, gymId, capacity, counts });
};
