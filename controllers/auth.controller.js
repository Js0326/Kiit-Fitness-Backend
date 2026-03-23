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
exports.registerStep1 = async (req, res) => {
  const { name, rollNo, email, phone, gender, hostel, room } = req.body;

  if (!name || !rollNo || !email || !phone || !gender || !hostel || !room) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!email.endsWith('@kiit.ac.in') && !email.endsWith('@stu.kiit.ac.in')) {
    return res.status(400).json({ error: 'Only KIIT email addresses are allowed (@kiit.ac.in or @stu.kiit.ac.in)' });
  }
  if (rollNo.length < 6) {
    return res.status(400).json({ error: 'Invalid roll number format' });
  }

  // Check if already registered
  const existing = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (!existing.empty) {
    return res.status(400).json({ error: 'Roll number already registered. Please login.' });
  }

  // Check students_master (if record exists, validate email match)
  // If NO record exists — allow registration as long as email is a valid KIIT address
  const masterDoc = await db.collection('students_master').doc(rollNo).get();
  if (masterDoc.exists) {
    const master = masterDoc.data();
    // Only enforce email match if a master record is found
    if (master.email && master.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({
        error: 'Email does not match university records for this roll number. Use your official KIIT email.',
      });
    }
  }
  // If no master record: allow any valid KIIT email — admin can manage real data via import-students.js

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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background:#111; color:#fff; padding:32px; border-radius:12px;">
          <h2 style="color: #FF6B00; margin:0 0 8px;">KIIT Fitness Center</h2>
          <p style="color:#9ca3af; margin:0 0 24px;">Email Verification</p>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your OTP for registration:</p>
          <div style="background:#1a1a1a; border:1px solid #2a2a2a; border-radius:12px; padding:24px; text-align:center; margin:24px 0;">
            <h1 style="color:#FF6B00; letter-spacing:12px; font-size:48px; margin:0;">${otp}</h1>
          </div>
          <p style="color:#9ca3af;">Expires in <strong style="color:#fff;">10 minutes</strong>. Do not share this with anyone.</p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error('Email send error:', emailErr.message);
    if (process.env.NODE_ENV === 'development') {
      console.log(`[DEV] OTP for ${rollNo}: ${otp}`);
    } else {
      // Log OTP to console in production too (for debugging) but don't fail
      console.log(`[OTP] Roll ${rollNo}: ${otp}`);
      // Note: if SMTP not configured, student won't get email but we still proceed
      // They can ask admin to check Render logs for the OTP
    }
  }

  res.json({
    message: 'OTP sent to your KIIT email. Check your inbox (and spam folder).',
    rollNo,
  });
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
  if (otp !== storedOtp) return res.status(400).json({ error: 'Invalid OTP. Check your email.' });

  const { name, email, phone, gender, hostel, room } = registrationData;
  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email, password, displayName: name });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      return res.status(400).json({ error: 'Email already registered. Please login.' });
    }
    return res.status(500).json({ error: 'Failed to create account: ' + err.message });
  }

  await db.collection('users').doc(firebaseUser.uid).set({
    uid: firebaseUser.uid,
    name, rollNo, email, phone, gender, hostel, room,
    gymId: null,
    role: 'student',
    isBanned: false,
    missedCount: 0,
    streak: 0,
    createdAt: Date.now(),
  });

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
    name, email,
    employeeId: employeeId || null,
    gymId, role: 'admin',
    isBanned: false,
    createdAt: Date.now(),
  });
  res.json({ message: `Admin created for gym ${gymId}`, uid: firebaseUser.uid });
};
