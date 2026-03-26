// ─────────────────────────────────────────────────────────────────
//  Combined Controller — NO composite index orderBy queries
//  All sorting done in JS to avoid Firestore index requirements
// ─────────────────────────────────────────────────────────────────
const { generateDailyQR, markAttendance } = require('../services/qr.service');
const { db } = require('../firebase/admin');
const { todayIST } = require('../utils/slots');

const jsSort = (docs, field, dir = 'desc') =>
  docs.sort((a, b) => dir === 'desc' ? (b[field] || 0) - (a[field] || 0) : (a[field] || 0) - (b[field] || 0));

// ── QR ────────────────────────────────────────────────────────────
exports.getMyQR = async (req, res) => {
  const userId = req.user.uid;
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
  const { gymId, isBanned } = userDoc.data();
  if (!gymId)    return res.status(400).json({ error: 'You are not registered to any gym' });
  if (isBanned)  return res.status(403).json({ error: 'Your account is banned' });

  const subSnap = await db.collection('subscriptions')
    .where('userId', '==', userId).where('gymId', '==', gymId).where('status', '==', 'active').get();
  if (subSnap.empty) return res.status(403).json({ error: 'No active subscription' });

  const today = todayIST();
  const bookSnap = await db.collection('bookings')
    .where('userId', '==', userId).where('date', '==', today).where('status', '==', 'booked').get();
  const slot = bookSnap.empty ? null : bookSnap.docs[0].data().slot;

  const { tokenId, qrToken } = await generateDailyQR(userId, gymId, slot);
  res.json({ qrToken, tokenId, date: today, gymId, slot });
};

exports.scanQR = async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'qrToken is required' });
  try {
    const result = await markAttendance(qrToken);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── Subscriptions ─────────────────────────────────────────────────
exports.getMySubscription = async (req, res) => {
  const snap = await db.collection('subscriptions')
    .where('userId', '==', req.user.uid).where('status', '==', 'active').get();
  if (snap.empty) return res.json(null);
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt');
  res.json(docs[0]);
};

exports.activateSubscription = async (req, res) => {
  const { userId, gymId, durationMonths = 1 } = req.body;
  if (!userId || !gymId) return res.status(400).json({ error: 'userId and gymId required' });

  const startDate = new Date();
  const endDate   = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + durationMonths);

  const oldSnap = await db.collection('subscriptions')
    .where('userId', '==', userId).where('gymId', '==', gymId).where('status', '==', 'active').get();
  const batch = db.batch();
  oldSnap.forEach((d) => batch.update(d.ref, { status: 'expired' }));

  const ref = db.collection('subscriptions').doc();
  batch.set(ref, {
    userId, gymId, status: 'active',
    startDate: startDate.toISOString().split('T')[0],
    endDate:   endDate.toISOString().split('T')[0],
    durationMonths,
    createdAt:   Date.now(),
    activatedBy: req.user.uid,
  });
  batch.update(db.collection('users').doc(userId), { gymId, isBanned: false });
  await batch.commit();
  res.json({ message: 'Subscription activated', subId: ref.id, endDate: endDate.toISOString().split('T')[0] });
};

exports.searchStudent = async (req, res) => {
  const { rollNo } = req.query;
  if (!rollNo) return res.status(400).json({ error: 'rollNo required' });
  const snap = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (snap.empty) return res.status(404).json({ error: 'Student not found' });
  const data = snap.docs[0].data();
  res.json({ uid: snap.docs[0].id, name: data.name, email: data.email, rollNo: data.rollNo, gymId: data.gymId, isBanned: data.isBanned, missedCount: data.missedCount });
};

exports.unbanStudent = async (req, res) => {
  await db.collection('users').doc(req.params.userId).update({ isBanned: false, missedCount: 0 });
  res.json({ message: 'Student unbanned' });
};

exports.getGymSubscriptions = async (req, res) => {
  const snap = await db.collection('subscriptions').where('gymId', '==', req.params.gymId).get();
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt');
  res.json(docs);
};

// ── Notifications ─────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  const { gymId } = req.query;
  const snap = await db.collection('notifications').limit(50).get();
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt')
    .filter((n) => !gymId || !n.gymId || n.gymId === gymId)
    .slice(0, 30);
  res.json(docs);
};

exports.createNotification = async (req, res) => {
  const { gymId, title, message, type } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'title and message required' });
  const ref = await db.collection('notifications').add({
    gymId: gymId || null, title, message,
    type: type || 'info',
    createdAt: Date.now(),
    createdBy: req.user.uid,
  });
  res.status(201).json({ id: ref.id, message: 'Notification created' });
};

exports.deleteNotification = async (req, res) => {
  await db.collection('notifications').doc(req.params.notifId).delete();
  res.json({ message: 'Deleted' });
};

// ── Complaints ────────────────────────────────────────────────────
exports.createComplaint = async (req, res) => {
  const { gymId, issue, category, images } = req.body;
  if (!gymId || !issue) return res.status(400).json({ error: 'gymId and issue required' });
  const ref = await db.collection('complaints').add({
    userId: req.user.uid, gymId, issue,
    category: category || 'general',
    status: 'open',
    createdAt: Date.now(),
  });
  res.status(201).json({ id: ref.id, message: 'Complaint submitted' });
};

exports.getMyComplaints = async (req, res) => {
  const snap = await db.collection('complaints').where('userId', '==', req.user.uid).get();
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt');
  res.json(docs);
};

exports.getGymComplaints = async (req, res) => {
  const snap = await db.collection('complaints').where('gymId', '==', req.params.gymId).get();
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'createdAt');
  res.json(docs);
};

exports.updateComplaintStatus = async (req, res) => {
  const { status, adminReply } = req.body;
  await db.collection('complaints').doc(req.params.complaintId).update({
    status,
    adminReply:  adminReply || null,
    resolvedAt:  status === 'resolved' ? Date.now() : null,
  });
  res.json({ message: 'Updated' });
};

// ── Attendance ────────────────────────────────────────────────────
exports.getMyAttendance = async (req, res) => {
  const snap = await db.collection('attendance').where('userId', '==', req.user.uid).get();
  const docs = jsSort(snap.docs.map((d) => ({ id: d.id, ...d.data() })), 'date')
    .slice(0, 90);
  res.json(docs);
};

exports.getGymAttendance = async (req, res) => {
  const { gymId } = req.params;
  const { date }  = req.query;
  let snap = await db.collection('attendance').where('gymId', '==', gymId).get();
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (date) docs = docs.filter((d) => d.date === date);
  res.json(jsSort(docs, 'date').slice(0, 200));
};
