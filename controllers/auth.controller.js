const { auth, db } = require('../firebase/admin');
require('dotenv').config();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ── Email sender (uses Resend API over HTTPS — works on Render free tier) ──
async function sendOTPEmail(to, name, otp) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

  if (!RESEND_API_KEY || RESEND_API_KEY === 'your_resend_api_key') {
    console.log(`[OTP] No Resend key configured. OTP for ${to}: ${otp}`);
    return; // Graceful fallback — OTP still logged
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'KIIT Fitness Center <onboarding@resend.dev>',
      to: [to],
      subject: 'KIIT Fitness Center — Email Verification OTP',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#111;color:#fff;padding:32px;border-radius:12px;">
          <h2 style="color:#FF6B00;margin:0 0 4px;">KIIT Fitness Center</h2>
          <p style="color:#9ca3af;margin:0 0 24px;font-size:14px;">Email Verification</p>
          <p>Hello <strong>${name}</strong>,</p>
          <p>Your one-time OTP for registration:</p>
          <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <h1 style="color:#FF6B00;letter-spacing:14px;font-size:48px;margin:0;">${otp}</h1>
          </div>
          <p style="color:#9ca3af;font-size:13px;">
            Expires in <strong style="color:#fff;">10 minutes</strong>.
            Do not share this with anyone.
          </p>
          <hr style="border:none;border-top:1px solid #2a2a2a;margin:24px 0;"/>
          <p style="color:#6b7280;font-size:12px;">
            KIIT University Fitness Center | Bhubaneswar, Odisha
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${res.status} — ${err}`);
  }
  console.log(`[EMAIL] OTP sent to ${to} via Resend`);
}

// ─── REGISTER Step 1 ────────────────────────────────────────────
exports.registerStep1 = async (req, res) => {
  const { name, rollNo, email, phone, gender, hostel, room } = req.body;

  if (!name || !rollNo || !email || !phone || !gender || !hostel || !room) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  if (!email.endsWith('@kiit.ac.in') && !email.endsWith('@stu.kiit.ac.in')) {
    return res.status(400).json({ error: 'Only KIIT email addresses are allowed (@kiit.ac.in or @stu.kiit.ac.in)' });
  }

  // Check if already registered
  const existing = await db.collection('users').where('rollNo', '==', rollNo).get();
  if (!existing.empty) {
    return res.status(400).json({ error: 'Roll number already registered. Please login.' });
  }

  // Check students_master — only enforce email match if record exists
  const masterDoc = await db.collection('students_master').doc(rollNo).get();
  if (masterDoc.exists) {
    const master = masterDoc.data();
    if (master.email && master.email.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match university records for this roll number.' });
    }
  }

  // Generate OTP
  const otp = generateOTP();
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || '10') * 60 * 1000;

  await db.collection('otps').doc(rollNo).set({
    otp, expiresAt,
    registrationData: { name, rollNo, email, phone, gender, hostel, room },
  });

  // Send OTP
  try {
    await sendOTPEmail(email, name, otp);
  } catch (emailErr) {
    console.error('Email error:', emailErr.message);
    // Don't fail registration — OTP is still in Firestore
    // Log it so admin can find it if needed
    console.log(`[OTP FALLBACK] Roll ${rollNo}: ${otp}`);
  }

  res.json({ message: 'OTP sent to your KIIT email. Check your inbox and spam folder.', rollNo });
};

// ─── VERIFY OTP Step 2 ──────────────────────────────────────────
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
  if (otp !== storedOtp) return res.status(400).json({ error: 'Invalid OTP. Please check your email.' });

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
    gymId: null, role: 'student',
    isBanned: false, missedCount: 0, streak: 0,
    createdAt: Date.now(),
  });

  await db.collection('otps').doc(rollNo).delete();
  res.json({ message: 'Registration successful! You can now login.', email });
};

// ─── GET ME ──────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const userDoc = await db.collection('users').doc(req.user.uid).get();
  if (!userDoc.exists) return res.status(404).json({ error: 'User not found' });
  res.json(userDoc.data());
};

// ─── CREATE ADMIN ────────────────────────────────────────────────
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
    uid: firebaseUser.uid, name, email,
    employeeId: employeeId || null,
    gymId, role: 'admin', isBanned: false, createdAt: Date.now(),
  });
  res.json({ message: `Admin created for gym ${gymId}`, uid: firebaseUser.uid });
};
