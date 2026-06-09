const express = require('express');
const controller = require('../controllers/problemController');
const { optionalAccessToken, verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', optionalAccessToken, controller.listProblems);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createProblem);
router.get('/:slug', optionalAccessToken, controller.getProblem);
router.put('/:slug', verifyAccessToken, requireRole('admin'), controller.updateProblem);
router.delete('/:slug', verifyAccessToken, requireRole('admin'), controller.deleteProblem);
router.get('/:slug/progress', verifyAccessToken, controller.getProblemProgress);
router.post('/:slug/bookmark', verifyAccessToken, controller.toggleBookmark);
router.put('/:slug/saved-code', verifyAccessToken, controller.saveCode);
router.post('/:slug/run', verifyAccessToken, controller.runCustom);

module.exports = router;
