const Discussion = require('../models/discussion');
const Problem = require('../models/problem');
const Contest = require('../models/contest');
const { asyncHandler, parsePagination, escapeRegExp } = require('../utils/controller');

const canModify = (req, discussion) => (
  req.user.role === 'admin' || discussion.author.toString() === req.user.id
);

const listDiscussions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = {};
  if (req.query.tag && req.query.tag !== 'All') filter.tags = req.query.tag;
  if (req.query.problem) filter.problem = req.query.problem;
  if (req.query.contest) filter.contest = req.query.contest;
  if (req.query.q) {
    const regex = new RegExp(escapeRegExp(req.query.q), 'i');
    filter.$or = [{ title: regex }, { body: regex }, { tags: regex }];
  }

  let sort = { isPinned: -1, createdAt: -1 };
  if (req.query.sortBy === 'top') {
    sort = { isPinned: -1, upvotes: -1, createdAt: -1 };
  } else if (req.query.sortBy === 'active') {
    sort = { isPinned: -1, updatedAt: -1 };
  }

  let discussions;
  let total;

  if (req.query.sortBy === 'comments') {
    // Aggregate discussions to sort by comment count
    const matchStage = { $match: filter };
    const addFieldsStage = {
      $addFields: {
        commentsCount: { $size: { $ifNull: ["$comments", []] } }
      }
    };
    const sortStage = { $sort: { isPinned: -1, commentsCount: -1, createdAt: -1 } };
    const skipStage = { $skip: skip };
    const limitStage = { $limit: limit };

    const results = await Discussion.aggregate([
      matchStage,
      addFieldsStage,
      sortStage,
      skipStage,
      limitStage
    ]);

    total = await Discussion.countDocuments(filter);
    discussions = await Discussion.populate(results, [
      { path: 'author', select: 'username avatar' },
      { path: 'problem', select: 'problemId slug title' },
      { path: 'contest', select: 'contestId name' }
    ]);
    
    // Project and format fields to match find query (remove full body)
    discussions = discussions.map(d => {
      const obj = { ...d };
      delete obj.body;
      if (obj.comments) {
        obj.comments = obj.comments.map(c => {
          const cObj = { ...c };
          delete cObj.body;
          return cObj;
        });
      }
      return obj;
    });
  } else {
    [discussions, total] = await Promise.all([
      Discussion.find(filter)
        .select('-body -comments.body')
        .populate('author', 'username avatar')
        .populate('problem', 'problemId slug title')
        .populate('contest', 'contestId name')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Discussion.countDocuments(filter),
    ]);
  }

  // Attach userVote helper flag
  const docs = discussions.map(d => {
    const docObj = d.toObject ? d.toObject() : d;
    docObj.userVote = null;
    if (req.user) {
      const userId = req.user.id;
      if (d.upvotedBy?.some(id => id.toString() === userId)) {
        docObj.userVote = 'up';
      } else if (d.downvotedBy?.some(id => id.toString() === userId)) {
        docObj.userVote = 'down';
      }
    }
    return docObj;
  });

  res.json({ discussions: docs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id)
    .populate('author', 'username avatar')
    .populate('comments.author', 'username avatar')
    .populate('problem', 'problemId slug title')
    .populate('contest', 'contestId name');
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const doc = discussion.toObject();
  doc.userVote = null;

  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }

    if (doc.comments) {
      doc.comments = doc.comments.map((c, idx) => {
        const commentModel = discussion.comments[idx];
        return {
          ...c,
          userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
        };
      });
    }
  }

  res.json({ discussion: doc });
});

const createDiscussion = asyncHandler(async (req, res) => {
  const { title, body, tags = [], problem, contest } = req.body;
  if (!title || !body) return res.status(400).json({ message: 'Title and body are required' });

  if (problem) {
    const exists = await Problem.findById(problem);
    if (!exists) return res.status(400).json({ message: 'Linked problem not found' });
  }
  if (contest) {
    const exists = await Contest.findById(contest);
    if (!exists) return res.status(400).json({ message: 'Linked contest not found' });
  }

  const discussion = await Discussion.create({
    title,
    body,
    tags,
    problem: problem || undefined,
    contest: contest || undefined,
    author: req.user.id,
    authorUsername: req.user.username,
  });

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  res.status(201).json({ discussion });
});

const updateDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });
  if (!canModify(req, discussion)) return res.status(403).json({ message: 'Access denied' });

  const allowed = req.user.role === 'admin'
    ? ['title', 'body', 'tags', 'isPinned', 'isLocked', 'problem', 'contest']
    : ['title', 'body', 'tags', 'problem', 'contest'];

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      if ((key === 'problem' || key === 'contest') && !req.body[key]) {
        discussion[key] = undefined;
      } else {
        discussion[key] = req.body[key];
      }
    }
  }

  if (discussion.problem) {
    const exists = await Problem.findById(discussion.problem);
    if (!exists) return res.status(400).json({ message: 'Linked problem not found' });
  }
  if (discussion.contest) {
    const exists = await Contest.findById(discussion.contest);
    if (!exists) return res.status(400).json({ message: 'Linked contest not found' });
  }

  await discussion.save();
  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = null;
  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }
    if (doc.comments) {
      doc.comments = doc.comments.map((c, idx) => {
        const commentModel = discussion.comments[idx];
        return {
          ...c,
          userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
        };
      });
    }
  }

  res.json({ discussion: doc });
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

  // Create notification if comment is from a different user
  if (discussion.author.toString() !== req.user.id) {
    try {
      const Notification = require('../models/notification');
      await Notification.create({
        user: discussion.author,
        title: 'New Comment on your Discussion',
        body: `${req.user.username} commented on your post "${discussion.title}"`,
        type: 'discussion',
        link: `/discuss/${discussion._id}`,
      });
    } catch (err) {
      console.error('Failed to create notification:', err);
    }
  }

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = null;
  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }
    if (doc.comments) {
      doc.comments = doc.comments.map((c, idx) => {
        const commentModel = discussion.comments[idx];
        return {
          ...c,
          userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
        };
      });
    }
  }

  res.status(201).json({ discussion: doc });
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

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = null;
  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }
    if (doc.comments) {
      doc.comments = doc.comments.map((c, idx) => {
        const commentModel = discussion.comments[idx];
        return {
          ...c,
          userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
        };
      });
    }
  }

  res.json({ discussion: doc });
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

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = null;
  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }
    if (doc.comments) {
      doc.comments = doc.comments.map((c, idx) => {
        const commentModel = discussion.comments[idx];
        return {
          ...c,
          userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
        };
      });
    }
  }

  res.json({ discussion: doc });
});

const voteDiscussion = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const vote = req.body.vote; // 'up', 'down', 'none'
  const userId = req.user.id;

  if (!discussion.upvotedBy) discussion.upvotedBy = [];
  if (!discussion.downvotedBy) discussion.downvotedBy = [];

  // Remove user from both arrays
  discussion.upvotedBy = discussion.upvotedBy.filter(id => id.toString() !== userId);
  discussion.downvotedBy = discussion.downvotedBy.filter(id => id.toString() !== userId);

  if (vote === 'up') {
    discussion.upvotedBy.push(userId);
  } else if (vote === 'down') {
    discussion.downvotedBy.push(userId);
  } else if (vote !== 'none') {
    return res.status(400).json({ message: 'Vote must be up, down, or none' });
  }

  discussion.upvotes = discussion.upvotedBy.length;
  discussion.downvotes = discussion.downvotedBy.length;

  await discussion.save();

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = vote === 'none' ? null : vote;
  if (doc.comments) {
    doc.comments = doc.comments.map((c, idx) => {
      const commentModel = discussion.comments[idx];
      return {
        ...c,
        userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
      };
    });
  }

  res.json({ discussion: doc });
});

const voteComment = asyncHandler(async (req, res) => {
  const discussion = await Discussion.findById(req.params.id);
  if (!discussion) return res.status(404).json({ message: 'Discussion not found' });

  const comment = discussion.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: 'Comment not found' });

  const vote = req.body.vote; // 'up', 'none'
  const userId = req.user.id;

  if (!comment.upvotedBy) comment.upvotedBy = [];

  comment.upvotedBy = comment.upvotedBy.filter(id => id.toString() !== userId);

  if (vote === 'up') {
    comment.upvotedBy.push(userId);
  } else if (vote !== 'none') {
    return res.status(400).json({ message: 'Vote must be up or none' });
  }

  comment.upvotes = comment.upvotedBy.length;

  await discussion.save();

  await discussion.populate([
    { path: 'author', select: 'username avatar' },
    { path: 'comments.author', select: 'username avatar' },
    { path: 'problem', select: 'problemId slug title' },
    { path: 'contest', select: 'contestId name' }
  ]);

  const doc = discussion.toObject();
  doc.userVote = null;
  if (req.user) {
    const userId = req.user.id;
    if (discussion.upvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'up';
    } else if (discussion.downvotedBy?.some(id => id.toString() === userId)) {
      doc.userVote = 'down';
    }
  }

  if (doc.comments) {
    doc.comments = doc.comments.map((c, idx) => {
      const commentModel = discussion.comments[idx];
      return {
        ...c,
        userVote: commentModel.upvotedBy?.some(id => id.toString() === userId) ? 'up' : null
      };
    });
  }

  res.json({ discussion: doc });
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
  voteComment,
};
