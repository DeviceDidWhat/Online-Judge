const express = require('express');
const controller = require('../controllers/discussionController');
const { verifyAccessToken, optionalAccessToken } = require('../middlewares/auth');

const router = express.Router();

router.get('/', optionalAccessToken, controller.listDiscussions);
router.post('/', verifyAccessToken, controller.createDiscussion);
router.get('/:id', optionalAccessToken, controller.getDiscussion);
router.put('/:id', verifyAccessToken, controller.updateDiscussion);
router.delete('/:id', verifyAccessToken, controller.deleteDiscussion);
router.post('/:id/comments', verifyAccessToken, controller.addComment);
router.put('/:id/comments/:commentId', verifyAccessToken, controller.updateComment);
router.delete('/:id/comments/:commentId', verifyAccessToken, controller.deleteComment);
router.post('/:id/comments/:commentId/vote', verifyAccessToken, controller.voteComment);
router.post('/:id/vote', verifyAccessToken, controller.voteDiscussion);

module.exports = router;
