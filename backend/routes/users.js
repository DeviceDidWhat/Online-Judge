const express = require('express');
const controller = require('../controllers/userController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/me', verifyAccessToken, controller.getMe);
router.put('/me', verifyAccessToken, controller.updateMe);
router.get('/me/activity', verifyAccessToken, controller.getActivity);
router.get('/leaderboard', controller.leaderboard);
router.get('/:username', controller.getProfile);
router.get('/', verifyAccessToken, requireRole('admin'), controller.listUsers);
router.put('/:id', verifyAccessToken, requireRole('admin'), controller.updateUser);
router.delete('/:id', verifyAccessToken, requireRole('admin'), controller.deleteUser);

module.exports = router;
