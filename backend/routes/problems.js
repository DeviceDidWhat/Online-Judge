const express = require('express');
const controller = require('../controllers/problemController');
const { optionalAccessToken, verifyAccessToken, requireRole } = require('../middlewares/auth');
const { rateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

// The "Run" button executes code in Docker; throttle per user on top of the
// in-process concurrency limiter in the controller.
const runLimiter = rateLimit({
  windowMs: Number(process.env.RUN_RATE_WINDOW_MS || 60_000),
  max: Number(process.env.RUN_RATE_MAX || 30),
  message: 'Too many run requests, please slow down.',
});

router.get('/', optionalAccessToken, controller.listProblems);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createProblem);
router.get('/:slug', optionalAccessToken, controller.getProblem);
router.put('/:slug', verifyAccessToken, requireRole('admin'), controller.updateProblem);
router.delete('/:slug', verifyAccessToken, requireRole('admin'), controller.deleteProblem);
// ── Test case management (admin) ──
router.get('/:slug/testcases', verifyAccessToken, requireRole('admin'), controller.listTestCases);
router.post('/:slug/testcases', verifyAccessToken, requireRole('admin'), controller.addTestCases);
router.patch('/:slug/testcases/:testCaseId', verifyAccessToken, requireRole('admin'), controller.updateTestCase);
router.delete('/:slug/testcases/:testCaseId', verifyAccessToken, requireRole('admin'), controller.deleteTestCase);

router.get('/:slug/progress', verifyAccessToken, controller.getProblemProgress);
router.post('/:slug/bookmark', verifyAccessToken, controller.toggleBookmark);
router.put('/:slug/saved-code', verifyAccessToken, controller.saveCode);
router.post('/:slug/run', verifyAccessToken, runLimiter, controller.runCustom);

module.exports = router;
