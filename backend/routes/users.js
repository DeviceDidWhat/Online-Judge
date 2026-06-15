const express = require('express');
const controller = require('../controllers/userController');
const { verifyAccessToken, optionalAccessToken, requireRole } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = express.Router();

router.get('/me', verifyAccessToken, controller.getMe);
router.put('/me', verifyAccessToken, controller.updateMe);
router.post('/me/avatar', verifyAccessToken, upload.single('avatar'), controller.uploadAvatar);
router.delete('/me/avatar', verifyAccessToken, controller.removeAvatar);
router.get('/me/activity', verifyAccessToken, controller.getActivity);
router.put('/me/privacy', verifyAccessToken, controller.updatePrivacy);
router.get('/leaderboard', controller.leaderboard);
router.get('/:username/activity', optionalAccessToken, controller.getPublicActivity);
router.get('/:username', optionalAccessToken, controller.getProfile);
router.get('/', verifyAccessToken, requireRole('admin'), controller.listUsers);
router.put('/:id', verifyAccessToken, requireRole('admin'), controller.updateUser);
router.delete('/:id', verifyAccessToken, requireRole('admin'), controller.deleteUser);

module.exports = router;
