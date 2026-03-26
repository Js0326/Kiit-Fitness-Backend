'use strict';
const { auth, db } = require('../firebase/admin');
require('dotenv').config();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Send OTP via Resend (HTTPS, works on Render) ───────────────────
async function sendOTPEmail(to, name, otp) {
  const key = process.env.RESEND_API_KEY;
  if (!key || key.startsWith('your_')) {
    console.log(`[OTP] No Resend key — OTP for ${to}: ${otp}`);
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'KIIT Fitness Center <onboarding@resend.dev>',
        to: [to],
        subject: 'KIIT Fitness Center — Your OTP',
        html: `<div style="font-family:Arial,sans-serif;background:#111;color:#fff;padding:32px;border-radius:12px;max-width:500px">
          <h2 style="color:#FF6B00">KIIT Fitness Center</h2>
          <p>Hello <strong>${name}</strong>, your OTP is:</p>
          <div style="background:#1a1a1a;border-radius:8px;padding:20px;text-align:center;margin:20px 0">
            <h1 style="color:#FF6B00;letter-spacing:12px;font-size:42px;margin:0">${otp}</h1>
          </div>
          <p style="color:#9ca3af;font-size:13px">Valid for 10 minutes. Do not share this OTP.</p>
        </div>`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('Email error:', e.message);
    return false;
  }
}

// ─── REGISTER Step 1 ─────────────────────────────────────────────
// verificationMethod: "otp" (default) | "link" (Firebase email link)
exports.registerStep1 = async (req, res) => {
  const { name, rollNo, email, phone, gender, hostel, room, verificationMethod } = req.body;

  if (!name || !rollNo || !email || !phone || !gender || !hostel || !room)
    return res.status(400).json({ error: 'All fields are required' });
  if (!email.endsWith('@kiit.ac.in') && !email.endsWith('@stu.kiit.ac.in'))
    return res.status(400).json({ error: 'Only KIIT email addresses are allowed' });

  const existing = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (!existing.empty) return res.status(400).json({ error: 'Roll number already registered. Please login.' });

  const masterDoc = await db.collection('students_master').doc(rollNo).get();
  if (masterDoc.exists) {
    const master = masterDoc.data();
    if (master.email && master.email.toLowerCase() !== email.toLowerCase())
      return res.status(400).json({ error: 'Email does not match university records for this roll number.' });
  }

  // ── Email verification link method ─────────────────────────────
  if (verificationMethod === 'link') {
    // Create a temporary unverified Firebase user first
    let uid;
    try {
      // Check if user already exists in Auth (from previous attempt)
      try {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        // Delete and recreate to reset state
        await auth.deleteUser(uid);
      } catch {}

      const tempUser = await auth.createUser({ email, emailVerified: false, displayName: name });
      uid = tempUser.uid;

      // Generate email verification link
      const actionCodeSettings = {
        url: `${process.env.FRONTEND_URL}/register?verified=true&rollNo=${rollNo}`,
        handleCodeInApp: true,
      };
      const verifyLink = await auth.generateEmailVerificationLink(email, actionCodeSettings);

      // Store registration data temporarily (pending email verification)
      await db.collection('pending_verifications').doc(uid).set({
        uid, name, rollNo, email, phone, gender, hostel, room,
        verifyLink, createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      });

      // Send via Resend
      const key = process.env.RESEND_API_KEY;
      if (key && !key.startsWith('your_')) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'KIIT Fitness Center <onboarding@resend.dev>',
            to: [email],
            subject: 'KIIT Fitness Center — Verify Your Email',
            html: `<div style="font-family:Arial,sans-serif;background:#111;color:#fff;padding:32px;border-radius:12px;max-width:500px">
              <h2 style="color:#FF6B00">KIIT Fitness Center</h2>
              <p>Hello <strong>${name}</strong>,</p>
              <p>Click the button below to verify your email and complete registration:</p>
              <a href="${verifyLink}" style="display:inline-block;background:#FF6B00;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;margin:20px 0">Verify Email Address</a>
              <p style="color:#9ca3af;font-size:13px">Link expires in 24 hours. If you didn't request this, ignore this email.</p>
            </div>`,
          }),
        });
        console.log(`[VERIFY LINK] Sent to ${email}`);
      } else {
        console.log(`[VERIFY LINK] ${verifyLink}`);
      }

      return res.json({
        message: 'Verification link sent to your KIIT email. Click the link to complete registration.',
        method: 'link',
        uid,
      });
    } catch (err) {
      console.error('Email link error:', err.message);
      return res.status(500).json({ error: 'Failed to send verification link: ' + err.message });
    }
  }

  // ── OTP method (default) ───────────────────────────────────────
  const otp = generateOTP();
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60 * 1000;

  await db.collection('otps').doc(rollNo).set({
    otp, expiresAt,
    registrationData: { name, rollNo, email, phone, gender, hostel, room },
  });

  const emailSent = await sendOTPEmail(email, name, otp);
  console.log(`[OTP] Roll ${rollNo}: ${otp}`);

  res.json({
    message: emailSent
      ? 'OTP sent to your KIIT email. Check your inbox and spam folder.'
      : 'OTP generated successfully.',
    rollNo,
    otp, // Always return OTP so student can see it on screen
    method: 'otp',
  });
};

// ─── COMPLETE LINK VERIFICATION ────────────────────────────────────
// Called after student clicks the email link and sets their password
exports.completeLinkVerification = async (req, res) => {
  const { uid, password } = req.body;
  if (!uid || !password) return res.status(400).json({ error: 'uid and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const pendingDoc = await db.collection('pending_verifications').doc(uid).get();
  if (!pendingDoc.exists) return res.status(400).json({ error: 'Verification record not found or expired. Please register again.' });

  const data = pendingDoc.data();
  if (Date.now() > data.expiresAt) {
    await db.collection('pending_verifications').doc(uid).delete();
    await auth.deleteUser(uid).catch(() => {});
    return res.status(400).json({ error: 'Verification link has expired. Please register again.' });
  }

  // Check if Firebase Auth user's email is verified
  const firebaseUser = await auth.getUser(uid);
  if (!firebaseUser.emailVerified) {
    return res.status(400).json({ error: 'Email not yet verified. Please click the link in your email first.' });
  }

  // Set password
  await auth.updateUser(uid, { password });

  // Create Firestore profile
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
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

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
