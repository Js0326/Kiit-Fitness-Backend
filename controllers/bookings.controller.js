const { db } = require('../firebase/admin');
const { todayIST, isGymOpen, isSlotBookable, getSlotById } = require('../utils/slots');

// ─── BOOK A SLOT ─────────────────────────────────────────────────
exports.createBooking = async (req, res) => {
  const userId = req.user.uid;
  const { gymId, date, slot } = req.body;

  if (!gymId || !date || !slot) {
    return res.status(400).json({ error: 'gymId, date, and slot are required' });
  }

  // Validate slot ID
  if (!getSlotById(slot)) return res.status(400).json({ error: 'Invalid slot ID' });

  // Check gym is open that day
  const dateObj = new Date(date + 'T00:00:00');
  if (!isGymOpen(dateObj)) return res.status(400).json({ error: 'Gym is closed on Mondays' });

  // Check booking window
  if (!isSlotBookable(slot, date)) {
    return res.status(400).json({ error: 'Booking window has closed for this slot' });
  }

  // Check user has active subscription at this gym
  const subSnap = await db.collection('subscriptions')
    .where('userId', '==', userId)
    .where('gymId', '==', gymId)
    .where('status', '==', 'active')
    .get();
  if (subSnap.empty) {
    return res.status(403).json({ error: 'No active subscription for this gym. Register at the gym desk first.' });
  }

  // Check user not banned
  const userDoc = await db.collection('users').doc(userId).get();
  if (userDoc.data()?.isBanned) {
    return res.status(403).json({ error: 'Your account is banned due to excessive missed slots. Contact gym admin.' });
  }

  // One booking per day per user
  const todayBooking = await db.collection('bookings')
    .where('userId', '==', userId)
    .where('date', '==', date)
    .get();
  if (!todayBooking.empty) {
    return res.status(400).json({ error: 'You already have a booking for this date' });
  }

  // Check slot capacity
  const gymDoc = await db.collection('gyms').doc(gymId).get();
  const capacity = gymDoc.data()?.capacityPerSlot || 20;

  const slotBookings = await db.collection('bookings')
    .where('gymId', '==', gymId)
    .where('date', '==', date)
    .where('slot', '==', slot)
    .where('status', 'in', ['booked', 'attended'])
    .get();

  if (slotBookings.size >= capacity) {
    return res.status(400).json({ error: 'This slot is full. Please choose another slot.' });
  }

  // Create booking
  const booking = {
    userId,
    gymId,
    date,
    slot,
    status: 'booked',
    createdAt: Date.now(),
  };
  const ref = await db.collection('bookings').add(booking);

  res.status(201).json({ id: ref.id, ...booking });
};

// ─── GET MY BOOKINGS ─────────────────────────────────────────────
exports.getMyBookings = async (req, res) => {
  const userId = req.user.uid;
  const snap = await db.collection('bookings').where('userId', '==', userId).get();
  const bookings = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 60);
  res.json(bookings);
};

// ─── CANCEL BOOKING ──────────────────────────────────────────────
exports.cancelBooking = async (req, res) => {
  const userId = req.user.uid;
  const doc = await db.collection('bookings').doc(req.params.bookingId).get();
  if (!doc.exists) return res.status(404).json({ error: 'Booking not found' });
  if (doc.data().userId !== userId) return res.status(403).json({ error: 'Not your booking' });
  if (doc.data().status !== 'booked') return res.status(400).json({ error: 'Booking cannot be cancelled' });

  await db.collection('bookings').doc(req.params.bookingId).update({ status: 'cancelled' });
  res.json({ message: 'Booking cancelled' });
};

// ─── ADMIN: GET GYM BOOKINGS ─────────────────────────────────────
exports.getGymBookings = async (req, res) => {
  const { gymId } = req.params;
  const { date } = req.query;
  let snap = await db.collection('bookings').where('gymId', '==', gymId).get();
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (date) docs = docs.filter((d) => d.date === date);
  docs.sort((a, b) => b.date > a.date ? 1 : -1);
  res.json(docs);
};

// ─── CRON: MARK MISSED SLOTS ─────────────────────────────────────
// Called daily by node-cron after last slot ends (8:10 PM IST)
exports.markMissedSlots = async () => {
  const today = todayIST();
  const snap = await db.collection('bookings')
    .where('date', '==', today)
    .where('status', '==', 'booked')
    .get();

  const batch = db.batch();
  const userMissMap = {};

  snap.forEach((doc) => {
    batch.update(doc.ref, { status: 'missed' });
    const uid = doc.data().userId;
    userMissMap[uid] = (userMissMap[uid] || 0) + 1;
  });

  // Increment missedCount, apply ban if >= 3
  for (const [uid, count] of Object.entries(userMissMap)) {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) continue;
    const newMissed = (userDoc.data().missedCount || 0) + count;
    const isBanned = newMissed >= 3;
    batch.update(userRef, { missedCount: newMissed, isBanned });
  }

  await batch.commit();
  console.log(`[CRON] Marked ${snap.size} bookings as missed`);
};
