const jwt = require('jsonwebtoken');
const { db } = require('../firebase/admin');
const { todayIST } = require('../utils/slots');
require('dotenv').config();

const QR_SECRET = process.env.QR_JWT_SECRET || 'qr_fallback_secret';

/**
 * Generate a daily QR token for a student
 * If one already exists and is valid + unused, return it
 */
const generateDailyQR = async (userId, gymId, slot) => {
  const date = todayIST();
  const tokenId = `${userId}_${gymId}_${date}`;

  // Check if an unused token exists for today
  const existing = await db.collection('qrTokens').doc(tokenId).get();
  if (existing.exists) {
    const data = existing.data();
    if (!data.isUsed && data.expiresAt > Date.now()) {
      return { tokenId, qrToken: data.token };
    }
  }

  // Build a new token (expires at midnight IST)
  const [y, m, d] = date.split('-').map(Number);
  const midnightIST = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
  const expiresAt = midnightIST.getTime();

  const payload = { userId, gymId, date, slot, tokenId };
  const qrToken = jwt.sign(payload, QR_SECRET, { expiresIn: Math.floor((expiresAt - Date.now()) / 1000) });

  await db.collection('qrTokens').doc(tokenId).set({
    userId,
    gymId,
    date,
    slot,
    token: qrToken,
    isUsed: false,
    expiresAt,
    createdAt: Date.now(),
  });

  return { tokenId, qrToken };
};

/**
 * Validate a scanned QR token — used by admin
 * Returns the decoded payload on success
 */
const validateQR = async (qrToken) => {
  let decoded;
  try {
    decoded = jwt.verify(qrToken, QR_SECRET);
  } catch (err) {
    throw new Error('QR token is invalid or expired');
  }

  const { tokenId, userId, gymId, date, slot } = decoded;

  const tokenDoc = await db.collection('qrTokens').doc(tokenId).get();
  if (!tokenDoc.exists) throw new Error('QR token not found in database');

  const tokenData = tokenDoc.data();
  if (tokenData.isUsed) throw new Error('QR token already used');
  if (tokenData.expiresAt < Date.now()) throw new Error('QR token has expired');

  // Check active subscription
  const subSnap = await db.collection('subscriptions')
    .where('userId', '==', userId)
    .where('gymId', '==', gymId)
    .where('status', '==', 'active')
    .get();
  if (subSnap.empty) throw new Error('No active subscription found for this student');

  // Check if student is banned
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) throw new Error('User not found');
  const userData = userDoc.data();
  if (userData.isBanned) throw new Error('Student is currently banned');

  return { decoded, userData };
};

/**
 * Mark QR as used + record attendance (called after validateQR succeeds)
 */
const markAttendance = async (qrToken) => {
  const { decoded, userData } = await validateQR(qrToken);
  const { tokenId, userId, gymId, date, slot } = decoded;

  const batch = db.batch();

  // Mark token used
  batch.update(db.collection('qrTokens').doc(tokenId), { isUsed: true });

  // Write attendance
  const attId = `${userId}_${date}`;
  batch.set(db.collection('attendance').doc(attId), {
    userId,
    gymId,
    date,
    slot,
    scannedAt: Date.now(),
  });

  // Mark booking as attended
  const bookSnap = await db.collection('bookings')
    .where('userId', '==', userId)
    .where('date', '==', date)
    .where('status', '==', 'booked')
    .get();

  bookSnap.forEach((doc) => batch.update(doc.ref, { status: 'attended' }));

  // Update streak
  const user = userData;
  let streak = user.streak || 0;
  // Check previous day attendance
  const yesterday = new Date(date);
  yesterday.setDate(yesterday.getDate() - 1);
  const ydStr = yesterday.toISOString().split('T')[0];
  const ydAtt = await db.collection('attendance').doc(`${userId}_${ydStr}`).get();
  streak = ydAtt.exists ? streak + 1 : 1;

  batch.update(db.collection('users').doc(userId), { streak });

  await batch.commit();

  return { userId, gymId, date, slot, userName: user.name, streak };
};

module.exports = { generateDailyQR, validateQR, markAttendance };
