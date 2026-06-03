const RatingHistory = require('../models/ratingHistory');
const { asyncHandler, parsePagination } = require('../utils/controller');

const listMyRatingHistory = asyncHandler(async (req, res) => {
  const history = await RatingHistory.find({ user: req.user.id }).populate('contest', 'contestId name').sort({ createdAt: 1 });
  res.json({ history });
});

const listRatingHistory = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 50 });
  const filter = {};
  if (req.query.user) filter.user = req.query.user;
  if (req.query.contest) filter.contest = req.query.contest;

  const [history, total] = await Promise.all([
    RatingHistory.find(filter).populate('user', 'username avatar').populate('contest', 'contestId name').sort({ createdAt: -1 }).skip(skip).limit(limit),
    RatingHistory.countDocuments(filter),
  ]);

  res.json({ history, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const createRatingHistory = asyncHandler(async (req, res) => {
  const history = await RatingHistory.create(req.body);
  res.status(201).json({ history });
});

module.exports = { listMyRatingHistory, listRatingHistory, createRatingHistory };
