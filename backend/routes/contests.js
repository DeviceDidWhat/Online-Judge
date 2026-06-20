const express = require('express');
const controller = require('../controllers/contestController');
const { optionalAccessToken, verifyAccessToken, requireRole } = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// In-contest submissions spawn Docker containers; throttle per user.
const submitLimiter = rateLimit({
  windowMs: Number(process.env.SUBMIT_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.SUBMIT_RATE_MAX || 20),
  message: 'Too many submissions, please slow down.',
});

// Public / optional-auth
router.get('/', controller.listContests);
router.get('/:id', optionalAccessToken, controller.getContest);
router.get('/:id/leaderboard', controller.contestLeaderboard);

// Authenticated users
router.post('/:id/register', verifyAccessToken, controller.registerForContest);
router.post('/:id/submit', verifyAccessToken, submitLimiter, controller.submitToContest);
router.get('/:id/my-submissions', verifyAccessToken, controller.getMyContestSubmissions);

// Admin only
router.post('/', verifyAccessToken, requireRole('admin'), controller.createContest);
router.put('/:id', verifyAccessToken, requireRole('admin'), controller.updateContest);
router.delete('/:id', verifyAccessToken, requireRole('admin'), controller.deleteContest);
router.post('/:id/finalize', verifyAccessToken, requireRole('admin'), controller.adminFinalizeContest);

module.exports = router;
