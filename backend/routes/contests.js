const express = require('express');
const controller = require('../controllers/contestController');
const { optionalAccessToken, verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', controller.listContests);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createContest);
router.get('/:id', optionalAccessToken, controller.getContest);
router.put('/:id', verifyAccessToken, requireRole('admin'), controller.updateContest);
router.delete('/:id', verifyAccessToken, requireRole('admin'), controller.deleteContest);
router.post('/:id/register', verifyAccessToken, controller.registerForContest);
router.get('/:id/leaderboard', controller.contestLeaderboard);

module.exports = router;
