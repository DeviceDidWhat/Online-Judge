const Discussion = require('../models/discussion');
const { asyncHandler, parsePagination, escapeRegExp } = require('../utils/controller');

const canModify = (req, discussion) => (
  req.user.role === 'admin' || discussion.author.toString() === req.user.id
);

const listDiscussions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = {};
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.q) {
    const regex = new RegExp(escapeRegExp(req.query.q), 'i');
    filter.$or = [{ title: regex }, { body: regex }, { tags: regex }];
  }

  const [discussions, total] = await Promise.all([
    Discussion.find(filter)
      .select('-body -comments.body')
      .populate('author', 'username avatar')
      .populate('problem', 'problemId slug title')
      .populate('contest', 'contestId name')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Discussion.countDocuments(filter),
  ]);

  res.json({ discussions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id)
    .populate('author', 'username avatar')
    .populate('comments.author', 'username avatar')
    .populate('problem', 'problemId slug title')
    .populate('contest', 'contestId name');
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
  res.json({ discussion });
});

const createDiscussion = asyncHandler(async (req, res) => {
  const { title, body, tags = [], problem, contest } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'Title and body are required' });

  const discussion = await Discussion.create({
    title,
    body,
    tags,
    problem,
    contest,
    author: req.user.id,
    authorUsername: req.user.username,
  });

  res.status(201).json({ discussion });
});

const updateDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
  if (!canModify(req, discussion)) return res.status(403).json({ message: 'Access denied' });

  const allowed = req.user.role === 'admin'
    ? ['title', 'body', 'tags', 'isPinned', 'isLocked']
    : ['title', 'body', 'tags'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) discussion[key] = req.body[key];
  }
  await discussion.save();
  res.json({ discussion });
});

const deleteDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
  if (!canModify(req, discussion)) return res.status(403).json({ message: 'Access denied' });

  await discussion.deleteOne();
  res.json({ message: 'Discussion deleted' });
});

const addComment = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
  if (discussion.isLocked) return res.status(423).json({ message: 'Discussion is locked' });
  if (!req.body.body) return res.status(400).json({ message: 'Comment body is required' });

  discussion.comments.push({ author: req.user.id, body: req.body.body });
  await discussion.save();
  res.status(201).json({ discussion });
});

const updateComment = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const comment = discussion.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  if (req.user.role !== 'admin' && comment.author.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Access denied' });
  }

  comment.body = req.body.body ?? comment.body;
  comment.updatedAt = new Date();
  await discussion.save();
  res.json({ discussion });
});

const deleteComment = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const comment = discussion.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });
  if (req.user.role !== 'admin' && comment.author.toString() !== req.user.id) {
    return res.status(403).json({ message: 'Access denied' });
  }

  comment.deleteOne();
  await discussion.save();
  res.json({ discussion });
});

const voteDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const vote = req.body.vote;
  if (vote === 'up') discussion.upvotes += 1;
  else if (vote === 'down') discussion.downvotes += 1;
  else return res.status(400).json({ message: 'Vote must be up or down' });

  await discussion.save();
  res.json({ discussion });
});

module.exports = {
  listDiscussions,
  getDiscussion,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addComment,
  updateComment,
  deleteComment,
  voteDiscussion,
};
