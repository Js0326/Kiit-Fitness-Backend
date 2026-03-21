const express = require('express');
const router = express.Router();
const { verifyToken, requireStudent, requireAdmin, requireSuper, requireGymAdmin } = require('../middleware/auth');
const authCtrl = require('../controllers/auth.controller');
const gymsCtrl = require('../controllers/gyms.controller');
const bookCtrl = require('../controllers/bookings.controller');
const ctrl = require('../controllers/combined.controller');

// ── Auth ────────────────────────────────────────────────────────
router.post('/auth/register/step1', authCtrl.registerStep1);
router.post('/auth/register/verify', authCtrl.verifyOTP);
router.get('/auth/me', verifyToken, authCtrl.getMe);
router.post('/auth/admin/create', verifyToken, requireSuper, authCtrl.createAdmin);

// ── Gyms ────────────────────────────────────────────────────────
router.get('/gyms', gymsCtrl.getAllGyms);
router.get('/gyms/:gymId', gymsCtrl.getGym);
router.put('/gyms/:gymId', verifyToken, requireAdmin, requireGymAdmin, gymsCtrl.updateGym);
router.get('/gyms/:gymId/availability', gymsCtrl.getSlotAvailability);
router.get('/gyms/:gymId/bookings', verifyToken, requireAdmin, bookCtrl.getGymBookings);
router.get('/gyms/:gymId/attendance', verifyToken, requireAdmin, ctrl.getGymAttendance);
router.get('/gyms/:gymId/subscriptions', verifyToken, requireAdmin, ctrl.getGymSubscriptions);
router.get('/gyms/:gymId/complaints', verifyToken, requireAdmin, ctrl.getGymComplaints);

// ── Bookings ────────────────────────────────────────────────────
router.post('/bookings', verifyToken, requireStudent, bookCtrl.createBooking);
router.get('/bookings/mine', verifyToken, bookCtrl.getMyBookings);
router.delete('/bookings/:bookingId', verifyToken, bookCtrl.cancelBooking);

// ── QR ──────────────────────────────────────────────────────────
router.get('/qr/mine', verifyToken, requireStudent, ctrl.getMyQR);
router.post('/qr/scan', verifyToken, requireAdmin, ctrl.scanQR);

// ── Subscriptions ───────────────────────────────────────────────
router.get('/subscriptions/mine', verifyToken, ctrl.getMySubscription);
router.post('/subscriptions/activate', verifyToken, requireAdmin, ctrl.activateSubscription);
router.get('/subscriptions/search', verifyToken, requireAdmin, ctrl.searchStudent);
router.post('/subscriptions/unban/:userId', verifyToken, requireAdmin, ctrl.unbanStudent);

// ── Notifications ───────────────────────────────────────────────
router.get('/notifications', ctrl.getNotifications);
router.post('/notifications', verifyToken, requireAdmin, ctrl.createNotification);
router.delete('/notifications/:notifId', verifyToken, requireAdmin, ctrl.deleteNotification);

// ── Complaints ──────────────────────────────────────────────────
router.post('/complaints', verifyToken, requireStudent, ctrl.createComplaint);
router.get('/complaints/mine', verifyToken, ctrl.getMyComplaints);
router.put('/complaints/:complaintId', verifyToken, requireAdmin, ctrl.updateComplaintStatus);

// ── Attendance ──────────────────────────────────────────────────
router.get('/attendance/mine', verifyToken, ctrl.getMyAttendance);

module.exports = router;

// ── Superadmin ──────────────────────────────────────────────────
const sa = require('../controllers/superadmin.controller');

// Stats & Config
router.get('/sa/stats',              verifyToken, requireSuper, sa.getSystemStats);
router.get('/sa/config',             verifyToken, requireSuper, sa.getConfig);
router.put('/sa/config',             verifyToken, requireSuper, sa.updateConfig);

// Gym management
router.post('/sa/gyms',              verifyToken, requireSuper, sa.createGym);
router.delete('/sa/gyms/:gymId',     verifyToken, requireSuper, sa.deleteGym);
router.put('/sa/gyms/:gymId/reactivate', verifyToken, requireSuper, sa.reactivateGym);

// Admin management
router.get('/sa/admins',             verifyToken, requireSuper, sa.getAllAdmins);
router.post('/sa/admins',            verifyToken, requireSuper, sa.createAdmin);
router.put('/sa/admins/:uid/revoke', verifyToken, requireSuper, sa.revokeAdmin);
router.put('/sa/admins/:uid/reinstate', verifyToken, requireSuper, sa.reinstateAdmin);
router.put('/sa/admins/:uid/password', verifyToken, requireSuper, sa.resetAdminPassword);
router.put('/sa/admins/:uid/reassign', verifyToken, requireSuper, sa.reassignAdmin);

// User management
router.get('/sa/users',              verifyToken, requireSuper, sa.getAllUsers);
router.get('/sa/users/:uid',         verifyToken, requireSuper, sa.getUserDetail);
router.put('/sa/users/:uid/ban',     verifyToken, requireSuper, sa.banUser);
router.put('/sa/users/:uid/unban',   verifyToken, requireSuper, sa.unbanUser);
router.put('/sa/users/:uid/reset',   verifyToken, requireSuper, sa.resetUserStats);

// Subscriptions
router.get('/sa/subscriptions',      verifyToken, requireSuper, sa.getAllSubscriptions);

// Complaints
router.get('/sa/complaints',         verifyToken, requireSuper, sa.getAllComplaints);
router.put('/sa/complaints/:complaintId', verifyToken, requireSuper, sa.resolveComplaint);

// Attendance
router.get('/sa/attendance',         verifyToken, requireSuper, sa.getAllAttendance);
