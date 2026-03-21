'use strict';
const { db, auth } = require('../firebase/admin');

// ── Helpers ────────────────────────────────────────────────────────
const jsSort = (arr, field, dir = 'desc') =>
  [...arr].sort((a, b) =>
    dir === 'desc' ? (b[field] || 0) - (a[field] || 0) : (a[field] || 0) - (b[field] || 0)
  );

// ── 1. SYSTEM STATS ────────────────────────────────────────────────
exports.getSystemStats = async (req, res) => {
  const [usersSnap, gymsSnap, subsSnap, bookSnap, compSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('gyms').get(),
    db.collection('subscriptions').get(),
    db.collection('bookings').get(),
    db.collection('complaints').get(),
  ]);

  const users         = usersSnap.docs.map(d => d.data());
  const subs          = subsSnap.docs.map(d => d.data());
  const bookings      = bookSnap.docs.map(d => d.data());
  const students      = users.filter(u => u.role === 'student');
  const admins        = users.filter(u => u.role === 'admin');
  const activeSubs    = subs.filter(s => s.status === 'active');
  const expiredSubs   = subs.filter(s => s.status === 'expired');
  const bannedUsers   = students.filter(u => u.isBanned);
  const openComps     = compSnap.docs.filter(d => d.data().status === 'open').length;

  // Bookings by gym
  const gymBookingMap = {};
  bookings.forEach(b => {
    if (!gymBookingMap[b.gymId]) gymBookingMap[b.gymId] = 0;
    gymBookingMap[b.gymId]++;
  });
  const busiestGym = Object.entries(gymBookingMap).sort((a,b) => b[1]-a[1])[0];

  // Bookings by slot (peak hours)
  const slotMap = {};
  bookings.forEach(b => {
    if (!slotMap[b.slot]) slotMap[b.slot] = 0;
    slotMap[b.slot]++;
  });

  // Revenue estimate (₹500/month per subscription)
  const revenueEstimate = activeSubs.length * 500;

  res.json({
    totalStudents:    students.length,
    totalAdmins:      admins.length,
    totalGyms:        gymsSnap.size,
    totalActiveSubs:  activeSubs.length,
    totalExpiredSubs: expiredSubs.length,
    totalBookings:    bookings.length,
    bannedUsers:      bannedUsers.length,
    openComplaints:   openComps,
    revenueEstimate,
    busiestGymId:     busiestGym?.[0] || null,
    busiestGymCount:  busiestGym?.[1] || 0,
    slotDistribution: slotMap,
    gymBookingMap,
  });
};

// ── 2. GYM MANAGEMENT ─────────────────────────────────────────────
exports.createGym = async (req, res) => {
  const { id, name, campus, gender, capacityPerSlot, description, location } = req.body;
  if (!id || !name || !campus || !gender) {
    return res.status(400).json({ error: 'id, name, campus, and gender are required' });
  }
  const existing = await db.collection('gyms').doc(id).get();
  if (existing.exists) return res.status(400).json({ error: 'Gym ID already exists' });

  await db.collection('gyms').doc(id).set({
    name, campus, gender,
    location:        location || '',
    description:     description || '',
    capacityPerSlot: Number(capacityPerSlot) || 20,
    equipment:       [],
    trainers:        [],
    images:          [],
    admins:          [],
    announcements:   [],
    active:          true,
    createdAt:       Date.now(),
    createdBy:       req.user.uid,
  });
  res.status(201).json({ message: 'Gym created', gymId: id });
};

exports.deleteGym = async (req, res) => {
  const { gymId } = req.params;
  // Soft delete — mark inactive rather than deleting data
  await db.collection('gyms').doc(gymId).update({ active: false, deactivatedAt: Date.now(), deactivatedBy: req.user.uid });
  res.json({ message: 'Gym deactivated' });
};

exports.reactivateGym = async (req, res) => {
  await db.collection('gyms').doc(req.params.gymId).update({ active: true });
  res.json({ message: 'Gym reactivated' });
};

// ── 3. ADMIN MANAGEMENT ────────────────────────────────────────────
exports.createAdmin = async (req, res) => {
  const { name, email, password, gymId, employeeId } = req.body;
  if (!name || !email || !password || !gymId) {
    return res.status(400).json({ error: 'name, email, password, and gymId required' });
  }
  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already registered' });
    }
    return res.status(500).json({ error: err.message });
  }
  await db.collection('users').doc(firebaseUser.uid).set({
    uid:        firebaseUser.uid,
    name, email,
    employeeId: employeeId || null,
    gymId,
    role:       'admin',
    isBanned:   false,
    active:     true,
    createdAt:  Date.now(),
    createdBy:  req.user.uid,
  });
  res.status(201).json({ message: `Admin created for ${gymId}`, uid: firebaseUser.uid });
};

exports.getAllAdmins = async (req, res) => {
  const snap = await db.collection('users').where('role', '==', 'admin').get();
  const admins = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  res.json(jsSort(admins, 'createdAt'));
};

exports.revokeAdmin = async (req, res) => {
  const { uid } = req.params;
  // Downgrade to student role + disable Firebase Auth
  await Promise.all([
    db.collection('users').doc(uid).update({ role: 'student', active: false, revokedAt: Date.now() }),
    auth.updateUser(uid, { disabled: true }),
  ]);
  res.json({ message: 'Admin access revoked' });
};

exports.reinstateAdmin = async (req, res) => {
  const { uid } = req.params;
  await Promise.all([
    db.collection('users').doc(uid).update({ role: 'admin', active: true, revokedAt: null }),
    auth.updateUser(uid, { disabled: false }),
  ]);
  res.json({ message: 'Admin reinstated' });
};

exports.resetAdminPassword = async (req, res) => {
  const { uid } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  await auth.updateUser(uid, { password: newPassword });
  res.json({ message: 'Password reset successfully' });
};

exports.reassignAdmin = async (req, res) => {
  const { uid } = req.params;
  const { gymId } = req.body;
  if (!gymId) return res.status(400).json({ error: 'gymId required' });
  await db.collection('users').doc(uid).update({ gymId });
  res.json({ message: `Admin reassigned to ${gymId}` });
};

// ── 4. SUBSCRIPTION OVERSIGHT ──────────────────────────────────────
exports.getAllSubscriptions = async (req, res) => {
  const { status, gymId } = req.query;
  let snap = await db.collection('subscriptions').get();
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) docs = docs.filter(s => s.status === status);
  if (gymId)  docs = docs.filter(s => s.gymId === gymId);
  res.json(jsSort(docs, 'createdAt').slice(0, 200));
};

// ── 5. USER MANAGEMENT ────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  const { role, banned, gymId, search } = req.query;
  let snap = await db.collection('users').get();
  let users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  if (role)   users = users.filter(u => u.role === role);
  if (banned) users = users.filter(u => u.isBanned === (banned === 'true'));
  if (gymId)  users = users.filter(u => u.gymId === gymId);
  if (search) {
    const q = search.toLowerCase();
    users = users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.rollNo?.toLowerCase().includes(q)
    );
  }
  // Never return passwords
  users = users.map(({ password, ...u }) => u);
  res.json(jsSort(users, 'createdAt').slice(0, 500));
};

exports.getUserDetail = async (req, res) => {
  const doc = await db.collection('users').doc(req.params.uid).get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  const { password, ...data } = doc.data();

  // Also fetch their recent bookings
  const bookSnap = await db.collection('bookings').where('userId', '==', req.params.uid).get();
  const bookings = jsSort(bookSnap.docs.map(d => ({ id: d.id, ...d.data() })), 'date').slice(0, 10);

  res.json({ uid: doc.id, ...data, recentBookings: bookings });
};

exports.banUser = async (req, res) => {
  const { uid } = req.params;
  const { reason } = req.body;
  await db.collection('users').doc(uid).update({
    isBanned: true,
    banReason: reason || 'Banned by superadmin',
    bannedAt:  Date.now(),
    bannedBy:  req.user.uid,
  });
  res.json({ message: 'User banned' });
};

exports.unbanUser = async (req, res) => {
  await db.collection('users').doc(req.params.uid).update({
    isBanned:    false,
    missedCount: 0,
    banReason:   null,
    bannedAt:    null,
  });
  res.json({ message: 'User unbanned' });
};

exports.resetUserStats = async (req, res) => {
  const { uid } = req.params;
  const { resetStreak, resetMissed } = req.body;
  const update = {};
  if (resetStreak) update.streak      = 0;
  if (resetMissed) update.missedCount = 0;
  if (!Object.keys(update).length) return res.status(400).json({ error: 'Nothing to reset' });
  await db.collection('users').doc(uid).update(update);
  res.json({ message: 'Stats reset', ...update });
};

// ── 6. COMPLAINTS (ALL GYMS) ───────────────────────────────────────
exports.getAllComplaints = async (req, res) => {
  const { status, gymId } = req.query;
  let snap = await db.collection('complaints').get();
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (status) docs = docs.filter(c => c.status === status);
  if (gymId)  docs = docs.filter(c => c.gymId === gymId);
  res.json(jsSort(docs, 'createdAt').slice(0, 300));
};

exports.resolveComplaint = async (req, res) => {
  const { status, adminReply } = req.body;
  await db.collection('complaints').doc(req.params.complaintId).update({
    status:     status || 'resolved',
    adminReply: adminReply || 'Resolved by Super Admin',
    resolvedAt: Date.now(),
    resolvedBy: req.user.uid,
  });
  res.json({ message: 'Complaint updated' });
};

// ── 7. SYSTEM CONFIG ──────────────────────────────────────────────
exports.getConfig = async (req, res) => {
  const doc = await db.collection('system_config').doc('global').get();
  if (!doc.exists) {
    // Return defaults
    return res.json({
      defaultCapacityPerSlot: 20,
      maxMissedBeforeBan:     3,
      subscriptionPriceMo:    500,
      allowSelfBooking:       true,
      bookingCutoffMinutes:   5,
    });
  }
  res.json(doc.data());
};

exports.updateConfig = async (req, res) => {
  const allowed = [
    'defaultCapacityPerSlot', 'maxMissedBeforeBan',
    'subscriptionPriceMo', 'allowSelfBooking', 'bookingCutoffMinutes',
  ];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  updates.updatedAt = Date.now();
  updates.updatedBy = req.user.uid;
  await db.collection('system_config').doc('global').set(updates, { merge: true });
  res.json({ message: 'Config updated', ...updates });
};

// ── 8. ATTENDANCE (ALL GYMS) ──────────────────────────────────────
exports.getAllAttendance = async (req, res) => {
  const { gymId, date } = req.query;
  let snap = await db.collection('attendance').get();
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (gymId) docs = docs.filter(a => a.gymId === gymId);
  if (date)  docs = docs.filter(a => a.date === date);
  res.json(jsSort(docs, 'date').slice(0, 500));
};
