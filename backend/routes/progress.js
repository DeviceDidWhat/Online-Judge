const express = require('express');
const controller = require('../controllers/progressController');
const { verifyAccessToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verifyAccessToken, controller.listProgress);
router.put('/:id', verifyAccessToken, controller.updateProgress);

module.exports = router;
