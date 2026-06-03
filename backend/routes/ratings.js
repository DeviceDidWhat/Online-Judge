const express = require('express');
const controller = require('../controllers/ratingController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/me', verifyAccessToken, controller.listMyRatingHistory);
router.get('/', verifyAccessToken, requireRole('admin'), controller.listRatingHistory);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createRatingHistory);

module.exports = router;
