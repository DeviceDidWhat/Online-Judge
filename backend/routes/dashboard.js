const express = require('express');
const controller = require('../controllers/dashboardController');
const { verifyAccessToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verifyAccessToken, controller.getDashboard);

module.exports = router;
