const express = require('express');
const controller = require('../controllers/submissionController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// Each submission spawns Docker containers; throttle per user so the judge queue
// can't be flooded. Applied after auth so the key is the user id.
const submitLimiter = rateLimit({
  windowMs: Number(process.env.SUBMIT_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.SUBMIT_RATE_MAX || 20),
  message: 'Too many submissions, please slow down.',
});

router.get('/', verifyAccessToken, controller.listSubmissions);
router.post('/', verifyAccessToken, submitLimiter, controller.createSubmission);
router.get('/:id', verifyAccessToken, controller.getSubmission);
router.patch('/:id/result', verifyAccessToken, requireRole('admin'), controller.updateSubmissionResult);

module.exports = router;
