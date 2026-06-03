const express = require('express');
const controller = require('../controllers/notificationController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verifyAccessToken, controller.listNotifications);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createNotification);
router.patch('/read-all', verifyAccessToken, controller.markAllRead);
router.patch('/:id/read', verifyAccessToken, controller.markRead);
router.delete('/:id', verifyAccessToken, controller.deleteNotification);

module.exports = router;
