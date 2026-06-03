const UserProblemProgress = require('../models/userProblemProgress');
const { asyncHandler, parsePagination } = require('../utils/controller');

const listProgress = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 30 });
  const filter = { user: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.bookmarked === 'true') filter.bookmarked = true;

  const [progress, total] = await Promise.all([
    UserProblemProgress.find(filter)
      .populate('problem', 'problemId slug title difficulty tags acceptance')
      .populate('bestSubmission', 'submissionId verdict runtime memory submittedAt')
      .populate('lastSubmission', 'submissionId verdict runtime memory submittedAt')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    UserProblemProgress.countDocuments(filter),
  ]);

  res.json({ progress, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const updateProgress = asyncHandler(async (req, res) => {
  const allowed = ['status', 'bookmarked', 'savedCode'];
  const update = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  }

  const progress = await UserProblemProgress.findOneAndUpdate(
    { _id: req.params.id, user: req.user.id },
    update,
    { new: true, runValidators: true }
  );
  if (!progress) return res.status(404).json({ message: 'Progress not found' });
  res.json({ progress });
});

module.exports = { listProgress, updateProgress };
