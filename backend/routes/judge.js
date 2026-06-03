const express = require('express');
const controller = require('../controllers/judgeController');
const { verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.use(verifyAccessToken, requireRole('admin'));
router.get('/jobs', controller.listJobs);
router.patch('/jobs/:id', controller.updateJob);
router.get('/workers', controller.listWorkers);
router.put('/workers/:workerId', controller.upsertWorker);
router.delete('/workers/:workerId', controller.deleteWorker);

module.exports = router;
