const express = require('express');
const controller = require('../controllers/ratingController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

// Authenticated user: their own history
router.get('/me', verifyAccessToken, controller.listMyRatingHistory);

// Public: any user's history by username
router.get('/user/:username', controller.listUserRatingHistory);

// Admin: list all, create manual entry, trigger finalization
router.get('/', verifyAccessToken, requireRole('admin'), controller.listRatingHistory);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createRatingHistory);
router.post('/finalize/:contestId', verifyAccessToken, requireRole('admin'), controller.triggerRatingFinalization);

module.exports = router;
