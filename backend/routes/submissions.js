const express = require('express');
const controller = require('../controllers/submissionController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', verifyAccessToken, controller.listSubmissions);
router.post('/', verifyAccessToken, controller.createSubmission);
router.get('/:id', verifyAccessToken, controller.getSubmission);
router.patch('/:id/result', verifyAccessToken, requireRole('admin'), controller.updateSubmissionResult);

module.exports = router;
