'use strict';
const { auth, db } = require('../firebase/admin');
require('dotenv').config();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── REGISTER Step 1 ─────────────────────────────────────────────
exports.registerStep1 = async (req, res) => {
  const { name, rollNo, email, phone, gender, hostel, room, verificationMethod } = req.body;

  if (!name || !rollNo || !email || !phone || !gender || !hostel || !room)
    return res.status(400).json({ error: 'All fields are required' });
  if (!email.endsWith('@kiit.ac.in') && !email.endsWith('@stu.kiit.ac.in'))
    return res.status(400).json({ error: 'Only KIIT email addresses are allowed' });

  // Check already registered
  const existing = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (!existing.empty)
    return res.status(400).json({ error: 'Roll number already registered. Please login.' });

  // Check students_master email match (if record exists)
  const masterDoc = await db.collection('students_master').doc(rollNo).get();
  if (masterDoc.exists) {
    const master = masterDoc.data();
    if (master.email && master.email.toLowerCase() !== email.toLowerCase())
      return res.status(400).json({ error: 'Email does not match university records for this roll number.' });
  }

  // ── EMAIL LINK METHOD ──────────────────────────────────────────
  // We create a Firebase user with a temporary random password.
  // The frontend will sign in with this temp password, call
  // sendEmailVerification() via the client SDK (which makes Firebase
  // send the email natively), then sign out.
  // The user sets their real password after clicking the link.
  if (verificationMethod === 'link') {
    // Clean up any previous failed attempt
    try {
      const prev = await auth.getUserByEmail(email);
      await auth.deleteUser(prev.uid);
    } catch {}

    // Temp password used only for the client to sign in and call sendEmailVerification
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + 'Aa1!';

    let firebaseUser;
    try {
      firebaseUser = await auth.createUser({ email, password: tempPassword, displayName: name });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create account: ' + err.message });
    }

    // Store registration data — real password set after email verified
    await db.collection('pending_verifications').doc(firebaseUser.uid).set({
      uid: firebaseUser.uid,
      name, rollNo, email, phone, gender, hostel, room,
      tempPassword,
      createdAt:  Date.now(),
      expiresAt:  Date.now() + 24 * 60 * 60 * 1000, // 24h
    });

    // Return tempPassword so frontend can sign in and trigger sendEmailVerification
    return res.json({
      method:       'link',
      uid:          firebaseUser.uid,
      email,
      tempPassword, // frontend uses this once to trigger Firebase email
      message:      'Account created. Sending verification email…',
    });
  }

  // ── OTP METHOD (default) ────────────────────────────────────────
  const otp = generateOTP();
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60 * 1000;

  await db.collection('otps').doc(rollNo).set({
    otp, expiresAt,
    registrationData: { name, rollNo, email, phone, gender, hostel, room },
  });

  console.log(`[OTP] Roll ${rollNo}: ${otp}`);

  res.json({
    method:  'otp',
    rollNo,
    otp,     // shown on screen
    message: 'OTP generated.',
  });
};

// ─── COMPLETE LINK VERIFICATION ────────────────────────────────────
// Called after user clicks Firebase email link and sets real password
exports.completeLinkVerification = async (req, res) => {
  const { uid, password } = req.body;
  if (!uid || !password)    return res.status(400).json({ error: 'uid and password required' });
  if (password.length < 8)  return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const pendingDoc = await db.collection('pending_verifications').doc(uid).get();
  if (!pendingDoc.exists)
    return res.status(400).json({ error: 'Verification record not found or expired. Please register again.' });

  const data = pendingDoc.data();
  if (Date.now() > data.expiresAt) {
    await db.collection('pending_verifications').doc(uid).delete();
    await auth.deleteUser(uid).catch(() => {});
    return res.status(400).json({ error: 'Verification link has expired. Please register again.' });
  }

  // Confirm Firebase has verified the email
  const firebaseUser = await auth.getUser(uid);
  if (!firebaseUser.emailVerified)
    return res.status(400).json({ error: 'Email not yet verified. Please click the link in your email first.' });

  // Update password to the real one
  await auth.updateUser(uid, { password });

  // Create Firestore user document
  await db.collection('users').doc(uid).set({
    uid, name: data.name, rollNo: data.rollNo, email: data.email,
    phone: data.phone, gender: data.gender, hostel: data.hostel, room: data.room,
    gymId: null, role: 'student', isBanned: false, missedCount: 0, streak: 0,
    createdAt: Date.now(),
  });

  await db.collection('pending_verifications').doc(uid).delete();
  res.json({ message: 'Registration complete! You can now login.', email: data.email });
};

// ─── VERIFY OTP Step 2 ───────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  const { rollNo, otp, password } = req.body;
  if (!rollNo || !otp || !password) return res.status(400).json({ error: 'All fields required' });
  if (password.length < 8)          return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const otpDoc = await db.collection('otps').doc(rollNo).get();
  if (!otpDoc.exists) return res.status(400).json({ error: 'No OTP found. Please register again.' });

  const { otp: stored, expiresAt, registrationData } = otpDoc.data();
  if (Date.now() > expiresAt) {
    await db.collection('otps').doc(rollNo).delete();
    return res.status(400).json({ error: 'OTP expired. Please register again.' });
  }
  if (otp !== stored) return res.status(400).json({ error: 'Invalid OTP.' });

  const { name, email, phone, gender, hostel, room } = registrationData;
  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === 'auth/email-already-exists')
      return res.status(400).json({ error: 'Email already registered. Please login.' });
    return res.status(500).json({ error: err.message });
  }

  await db.collection('users').doc(firebaseUser.uid).set({
    uid: firebaseUser.uid, name, rollNo, email, phone, gender, hostel, room,
    gymId: null, role: 'student', isBanned: false, missedCount: 0, streak: 0,
    createdAt: Date.now(),
  });

  await db.collection('otps').doc(rollNo).delete();
  res.json({ message: 'Registration successful! You can now login.', email });
};

// ─── GET ME ──────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const doc = await db.collection('users').doc(req.user.uid).get();
  if (!doc.exists) return res.status(404).json({ error: 'User not found' });
  res.json(doc.data());
};

// ─── CREATE ADMIN ────────────────────────────────────────────────
exports.createAdmin = async (req, res) => {
  const { name, email, password, gymId, employeeId } = req.body;
  if (!name || !email || !password || !gymId)
    return res.status(400).json({ error: 'Name, email, password, and gymId are required' });
  let user;
  try {
    user = await auth.createUser({ email, password, displayName: name });
  } catch (err) { return res.status(400).json({ error: err.message }); }
  await db.collection('users').doc(user.uid).set({
    uid: user.uid, name, email, employeeId: employeeId || null,
    gymId, role: 'admin', isBanned: false, active: true, createdAt: Date.now(),
  });
  res.json({ message: `Admin created for ${gymId}`, uid: user.uid });
};
