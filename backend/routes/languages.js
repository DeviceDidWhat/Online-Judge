const express = require('express');
const controller = require('../controllers/languageController');
const { optionalAccessToken, verifyAccessToken, requireRole } = require('../middlewares/auth');

const router = express.Router();

router.get('/', optionalAccessToken, controller.listLanguages);
router.post('/', verifyAccessToken, requireRole('admin'), controller.createLanguage);
router.put('/:id', verifyAccessToken, requireRole('admin'), controller.updateLanguage);
router.delete('/:id', verifyAccessToken, requireRole('admin'), controller.deleteLanguage);

module.exports = router;
