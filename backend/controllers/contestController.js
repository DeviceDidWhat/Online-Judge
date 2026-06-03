const Contest = require('../models/contest');
const ContestRegistration = require('../models/contestRegistration');
const { asyncHandler, parsePagination, escapeRegExp, isObjectId } = require('../utils/controller');

const contestLookup = (id) => {
  const query = [{ contestId: Number(id) || -1 }];
  if (isObjectId(id)) query.push({ _id: id });
  return { $or: query };
};

const listContests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.name = new RegExp(escapeRegExp(req.query.q), 'i');

  const [contests, total] = await Promise.all([
    Contest.find(filter).populate('problems.problem', 'problemId slug title difficulty').sort({ startsAt: -1 }).skip(skip).limit(limit),
    Contest.countDocuments(filter),
  ]);

  res.json({ contests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id)).populate('problems.problem', 'problemId slug title difficulty');
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const registration = req.user
    ? await ContestRegistration.findOne({ contest: contest._id, user: req.user.id })
    : null;

  res.json({ contest, registration });
});

const createContest = asyncHandler(async (req, res) => {
  const contest = await Contest.create({ ...req.body, createdBy: req.user.id });
  res.status(201).json({ contest });
});

const updateContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOneAndUpdate(contestLookup(req.params.id), req.body, { new: true, runValidators: true });
  if (!contest) return res.status(404).json({ message: 'Contest not found' });
  res.json({ contest });
});

const deleteContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOneAndDelete(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });
  await ContestRegistration.deleteMany({ contest: contest._id });
  res.json({ message: 'Contest deleted' });
});

const registerForContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const existing = await ContestRegistration.findOne({ contest: contest._id, user: req.user.id });
  if (existing) {
    return res.json({ registration: existing });
  }

  const registration = await ContestRegistration.create({ contest: contest._id, user: req.user.id });
  await Contest.findByIdAndUpdate(contest._id, { $inc: { registeredCount: 1 } });

  res.status(201).json({ registration });
});

const contestLeaderboard = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id)).select('_id');
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const registrations = await ContestRegistration.find({ contest: contest._id })
    .populate('user', 'username avatar country rating')
    .sort({ score: -1, penalty: 1, updatedAt: 1 })
    .limit(200);

  res.json({ leaderboard: registrations });
});

module.exports = {
  listContests,
  getContest,
  createContest,
  updateContest,
  deleteContest,
  registerForContest,
  contestLeaderboard,
};
