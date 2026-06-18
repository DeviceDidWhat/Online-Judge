const Submission = require('../models/submission');
const User = require('../models/user');
const UserActivity = require('../models/userActivity');
const RatingHistory = require('../models/ratingHistory');
const { asyncHandler } = require('../utils/controller');

const getDashboard = asyncHandler(async (req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 365);
  since.setHours(0, 0, 0, 0);

  const [user, recentSubmissions, activity, ratingHistory, verdictStats] = await Promise.all([
    User.findById(req.user.id).select('name username email role avatar country rating rank solved streak badges joinedAt preferences'),
    Submission.find({ user: req.user.id }).select('-sourceCode -testcaseResults -failedTestcase -stdout -stderr -compileOutput').populate('problem', 'problemId slug title difficulty').sort({ submittedAt: -1 }).limit(10),
    UserActivity.find({ user: req.user.id, date: { $gte: since } }).sort({ date: 1 }),
    RatingHistory.find({ user: req.user.id }).sort({ createdAt: 1 }).limit(50),
    Submission.aggregate([
      { $match: { user: require('mongoose').Types.ObjectId.createFromHexString(req.user.id) } },
      { $group: { _id: '$verdict', value: { $sum: 1 } } },
      { $project: { _id: 0, name: '$_id', value: 1 } },
    ]),
  ]);

  res.json({ user, recentSubmissions, activity, ratingHistory, verdictStats });
});

module.exports = { getDashboard };
