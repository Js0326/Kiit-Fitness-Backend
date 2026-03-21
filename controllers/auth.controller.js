const { auth, db } = require('../firebase/admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ─── REGISTER (Step 1) ───────────────────────────────────────────
// Validates against mock students_master, sends OTP to KIIT email
exports.registerStep1 = async (req, res) => {
  const { name, rollNo, email, phone, gender, hostel, room } = req.body;

  if (!name || !rollNo || !email || !phone || !gender || !hostel || !room) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!email.endsWith('@kiit.ac.in') && !email.endsWith('@stu.kiit.ac.in')) {
    return res.status(400).json({ error: 'Only KIIT email addresses are allowed' });
  }

  // Check mock students_master
  const masterDoc = await db.collection('students_master').doc(rollNo).get();
  if (!masterDoc.exists) {
    return res.status(400).json({ error: 'Roll number not found in university records' });
  }
  const master = masterDoc.data();
  if (
    master.email.toLowerCase() !== email.toLowerCase() ||
    master.hostel.toLowerCase() !== hostel.toLowerCase() ||
    master.gender.toLowerCase() !== gender.toLowerCase()
  ) {
    return res.status(400).json({ error: 'Details do not match university records. Check your email, hostel, and gender.' });
  }

  // Check if already registered
  const existing = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (!existing.empty) {
    return res.status(400).json({ error: 'Roll number already registered. Please login.' });
  }

  // Generate & store OTP (expires in 10 min)
  const otp = generateOTP();
  const expiresAt = Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES || '10')) * 60 * 1000;

  await db.collection('otps').doc(rollNo).set({
    otp,
    expiresAt,
    registrationData: { name, rollNo, email, phone, gender, hostel, room },
  });

  // Send OTP email
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'KIIT Fitness Center — Email Verification OTP',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FF6B00;">KIIT Fitness Center</h2>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your OTP for email verification is:</p>
          <h1 style="color: #FF6B00; letter-spacing: 8px; font-size: 48px;">${otp}</h1>
          <p>This OTP expires in <strong>10 minutes</strong>.</p>
          <p style="color: #888;">If you didn't request this, please ignore this email.</p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error('Email send error:', emailErr.message);
    // In dev, log OTP instead of failing
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP for ${rollNo}: ${otp}`);
    } else {
      return res.status(500).json({ error: 'Failed to send OTP email. Try again.' });
    }
  }

  res.json({ message: 'OTP sent to your KIIT email. Check your inbox.', rollNo });
};

// ─── VERIFY OTP (Step 2) ─────────────────────────────────────────
exports.verifyOTP = async (req, res) => {
  const { rollNo, otp, password } = req.body;
  if (!rollNo || !otp || !password) {
    return res.status(400).json({ error: 'Roll number, OTP, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const otpDoc = await db.collection('otps').doc(rollNo).get();
  if (!otpDoc.exists) return res.status(400).json({ error: 'No OTP found. Please register again.' });

  const { otp: storedOtp, expiresAt, registrationData } = otpDoc.data();
  if (Date.now() > expiresAt) {
    await db.collection('otps').doc(rollNo).delete();
    return res.status(400).json({ error: 'OTP has expired. Please register again.' });
  }
  if (otp !== storedOtp) return res.status(400).json({ error: 'Invalid OTP' });

  // Create Firebase Auth user
  const { name, email, phone, gender, hostel, room } = registrationData;
  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already registered. Please login.' });
    }
    return res.status(500).json({ error: 'Failed to create account' });
  }

  // Write to Firestore users collection
  await db.collection('users').doc(firebaseUser.uid).set({
    uid: firebaseUser.uid,
    name,
    rollNo,
    email,
    phone,
    gender,
    hostel,
    room,
    gymId: null,
    role: 'student',
    isBanned: false,
    missedCount: 0,
    streak: 0,
    createdAt: Date.now(),
  });

  // Clean up OTP
  await db.collection('otps').doc(rollNo).delete();

  res.json({ message: 'Registration successful! You can now login.', email });
};

// ─── GET CURRENT USER PROFILE ────────────────────────────────────
exports.getMe = async (req, res) => {
  const userDoc = await db.collection('users').doc(req.user.uid).get();
  if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
  res.json(userDoc.data());
};

// ─── ADMIN CREATION (superadmin only) ───────────────────────────
exports.createAdmin = async (req, res) => {
  const { name, email, password, gymId, employeeId } = req.body;
  if (!name || !email || !password || !gymId) {
    return res.status(400).json({ error: 'Name, email, password, and gymId are required' });
  }

  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  await db.collection('users').doc(firebaseUser.uid).set({
    uid: firebaseUser.uid,
    name,
    email,
    employeeId: employeeId || null,
    gymId,
    role: 'admin',
    isBanned: false,
    createdAt: Date.now(),
  });

  res.json({ message: `Admin created for gym ${gymId}`, uid: firebaseUser.uid });
};
