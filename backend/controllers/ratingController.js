const RatingHistory = require('../models/ratingHistory');
const User = require('../models/user');
const { finalizeContest } = require('../services/contestService');
const { asyncHandler, parsePagination } = require('../utils/controller');

// Current user's full rating history (for profile chart)
const listMyRatingHistory = asyncHandler(async (req, res) => {
  const history = await RatingHistory.find({ user: req.user.id })
    .populate('contest', 'contestId name')
    .sort({ createdAt: 1 });
  res.json({ history });
});

// Public: get rating history for any user by username
const listUserRatingHistory = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select('_id');
  if (!user) return res.status(404).json({ message: 'User not found' });

  const history = await RatingHistory.find({ user: user._id })
    .populate('contest', 'contestId name')
    .sort({ createdAt: 1 });
  res.json({ history });
});

// Admin: paginated listing with filters
const listRatingHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 50 });
  const filter = {};
  if (req.query.user) filter.user = req.query.user;
  if (req.query.contest) filter.contest = req.query.contest;

  const [history, total] = await Promise.all([
    RatingHistory.find(filter)
      .populate('user', 'username avatar')
      .populate('contest', 'contestId name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    RatingHistory.countDocuments(filter),
  ]);

  res.json({ history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Admin: manually trigger rating finalization for a specific contest
const triggerRatingFinalization = asyncHandler(async (req, res) => {
  const Contest = require('../models/contest');
  const contest = await Contest.findOne({
    $or: [
      { contestId: Number(req.params.contestId) || -1 },
      ...(require('../utils/controller').isObjectId(req.params.contestId)
        ? [{ _id: req.params.contestId }]
        : []),
    ],
  });
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  // Force reset so re-finalization is possible
  if (req.query.force === 'true') {
    await Contest.findByIdAndUpdate(contest._id, { ratingProcessed: false });
  }

  const processed = await finalizeContest(contest._id);
  res.json({
    message: processed ? 'Ratings finalized successfully' : 'Already finalized (use ?force=true to redo)',
    processed,
  });
});

// Admin: create a manual rating history entry (kept for backward-compat)
const createRatingHistory = asyncHandler(async (req, res) => {
  const history = await RatingHistory.create(req.body);
  res.status(201).json({ history });
});

module.exports = {
  listMyRatingHistory,
  listUserRatingHistory,
  listRatingHistory,
  createRatingHistory,
  triggerRatingFinalization,
};
