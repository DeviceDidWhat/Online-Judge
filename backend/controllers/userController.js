const User = require('../models/user');
const Submission = require('../models/submission');
const UserActivity = require('../models/userActivity');
const RatingHistory = require('../models/ratingHistory');
const { asyncHandler, parsePagination, escapeRegExp } = require('../utils/controller');

const publicUserSelect = 'name username email role avatar country rating rank solved streak badges joinedAt preferences';

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select(publicUserSelect);
  res.json({ user });
});

const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'username', 'avatar', 'country', 'preferences'];
  const update = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) update[key] = req.body[key];
  }

  const user = await User.findByIdAndUpdate(req.user.id, update, { new: true, runValidators: true }).select(publicUserSelect);
  res.json({ user });
});

const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ username: req.params.username }).select(publicUserSelect);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const [recentSubmissions, ratingHistory] = await Promise.all([
    Submission.find({ user: user._id }).select('-sourceCode').populate('problem', 'problemId slug title difficulty').sort({ submittedAt: -1 }).limit(10),
    RatingHistory.find({ user: user._id }).sort({ createdAt: 1 }).limit(50),
  ]);

  res.json({ user, recentSubmissions, ratingHistory });
});

const leaderboard = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 50 });
  const filter = {};
  if (req.query.q) filter.username = new RegExp(escapeRegExp(req.query.q), 'i');

  const [users, total] = await Promise.all([
    User.find(filter).select('username avatar country rating rank solved streak').sort({ rating: -1, 'solved.total': -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 30 });
  const filter = {};
  if (req.query.q) {
    const regex = new RegExp(escapeRegExp(req.query.q), 'i');
    filter.$or = [{ username: regex }, { email: regex }, { name: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).select(publicUserSelect).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({ users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).select(publicUserSelect);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ message: 'User deleted' });
});

const getActivity = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 365, 730);
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const activity = await UserActivity.find({ user: req.user.id, date: { $gte: since } }).sort({ date: 1 });
  res.json({ activity });
});

module.exports = { getMe, updateMe, getProfile, leaderboard, listUsers, updateUser, deleteUser, getActivity };
