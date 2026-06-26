const express = require('express');
const controller = require('../controllers/aiController');
const { verifyAccessToken } = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// AI calls hit an external API with a shared quota — throttle per user.
const aiLimiter = rateLimit({
  windowMs: Number(process.env.AI_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.AI_RATE_MAX || 12),
  message: 'Too many AI requests, please slow down.',
});

router.post('/review', verifyAccessToken, aiLimiter, controller.review);
router.post('/hint', verifyAccessToken, aiLimiter, controller.hint);

module.exports = router;
