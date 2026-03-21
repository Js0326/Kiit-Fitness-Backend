const { auth, db } = require('../firebase/admin');

// Verify Firebase ID Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const idToken = authHeader.split('Bearer ')[1];
  try {
    const decoded = await auth.verifyIdToken(idToken);
    req.user = decoded;

    // Attach role from Firestore
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      req.userProfile = userDoc.data();
      req.user.role = userDoc.data().role || 'student';
      req.user.gymId = userDoc.data().gymId || null;
    } else {
      req.user.role = 'student';
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Role guard factory
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

const requireStudent = requireRole('student', 'admin', 'superadmin');
const requireAdmin   = requireRole('admin', 'superadmin');
const requireSuper   = requireRole('superadmin');

// Ensure admin only manages their own gym
const requireGymAdmin = (req, res, next) => {
  const gymId = req.params.gymId || req.body.gymId;
  if (req.user.role === 'superadmin') return next();
  if (req.user.role === 'admin' && req.user.gymId === gymId) return next();
  return res.status(403).json({ error: 'You can only manage your own gym' });
};

module.exports = { verifyToken, requireStudent, requireAdmin, requireSuper, requireGymAdmin };
