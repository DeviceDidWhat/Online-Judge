const crypto = require('crypto');
const Contest = require('../models/contest');
const ContestRegistration = require('../models/contestRegistration');
const Problem = require('../models/problem');
const Submission = require('../models/submission');
const JudgeJob = require('../models/judgeJob');
const { enqueueJudgeJob } = require('../services/judgeQueue');
const { scheduleContestLifecycle, cancelContestLifecycle } = require('../services/contestQueue');
const { finalizeContest } = require('../services/contestService');
const { asyncHandler, parsePagination, escapeRegExp, isObjectId } = require('../utils/controller');
const { getIO } = require('../socket');

const contestLookup = (id) => {
  const query = [{ contestId: Number(id) || -1 }];
  if (isObjectId(id)) query.push({ _id: id });
  return { $or: query };
};

// ─── List / Get / CRUD ───────────────────────────────────────────────────────

const listContests = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.name = new RegExp(escapeRegExp(req.query.q), 'i');

  const [contests, total] = await Promise.all([
    Contest.find(filter)
      .populate('problems.problem', 'problemId slug title difficulty')
      .sort({ startsAt: -1 })
      .skip(skip)
      .limit(limit),
    Contest.countDocuments(filter),
  ]);

  res.json({ contests, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id))
    .populate('problems.problem', 'problemId slug title difficulty');
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const registration = req.user
    ? await ContestRegistration.findOne({ contest: contest._id, user: req.user.id })
    : null;

  res.json({ contest, registration });
});

const createContest = asyncHandler(async (req, res) => {
  const { startsAt, problems = [], ...rest } = req.body;

  if (!startsAt) return res.status(400).json({ message: 'startsAt is required' });
  const startDate = new Date(startsAt);
  if (isNaN(startDate.getTime())) return res.status(400).json({ message: 'Invalid startsAt date' });

  // Validate problems exist
  if (problems.length > 0) {
    const problemIds = problems.map((p) => p.problem).filter(isObjectId);
    const found = await Problem.find({ _id: { $in: problemIds } }).select('_id');
    if (found.length !== problemIds.length) {
      return res.status(400).json({ message: 'One or more problems not found' });
    }
  }

  const contest = await Contest.create({
    ...rest,
    startsAt: startDate,
    problems,
    createdBy: req.user.id,
  });
  await scheduleContestLifecycle(contest);

  // Broadcast to all connected clients so the contests list updates instantly
  try {
    const io = getIO();
    io.emit('contest:new', { contest });
  } catch {}

  res.status(201).json({ contest });
});

const updateContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOneAndUpdate(
    contestLookup(req.params.id),
    req.body,
    { new: true, runValidators: true }
  );
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  // startsAt/duration drive the scheduled go-live/end jobs — a delayed BullMQ job
  // can't have its delay changed in place, so cancel and re-add with the new times.
  if (req.body.startsAt !== undefined || req.body.duration !== undefined) {
    await cancelContestLifecycle(contest._id);
    await scheduleContestLifecycle(contest);
  }

  res.json({ contest });
});

const deleteContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOneAndDelete(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });
  await ContestRegistration.deleteMany({ contest: contest._id });
  await cancelContestLifecycle(contest._id);
  res.json({ message: 'Contest deleted' });
});

// ─── Registration ─────────────────────────────────────────────────────────────

const registerForContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });
  if (contest.status === 'ended') {
    return res.status(400).json({ message: 'Contest has already ended' });
  }

  const existing = await ContestRegistration.findOne({ contest: contest._id, user: req.user.id });
  if (existing) {
    return res.json({ registration: existing });
  }

  const registration = await ContestRegistration.create({ contest: contest._id, user: req.user.id });
  const updated = await Contest.findByIdAndUpdate(
    contest._id,
    { $inc: { registeredCount: 1 } },
    { new: true }
  ).select('registeredCount');

  // Broadcast updated participant count to all connected clients in real-time
  try {
    const io = getIO();
    io.emit('contest:participantUpdate', {
      contestId: String(contest._id),
      registeredCount: updated.registeredCount,
    });
  } catch {}

  res.status(201).json({ registration });
});

// ─── Leaderboard ──────────────────────────────────────────────────────────────

const contestLeaderboard = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id)).select('_id problems');
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const { page, limit, skip } = parsePagination(req.query, { limit: 100 });

  const [registrations, total] = await Promise.all([
    ContestRegistration.find({ contest: contest._id })
      .populate('user', 'username avatar country rating')
      .sort({ score: -1, penalty: 1, lastSolveAt: 1 })
      .skip(skip)
      .limit(limit),
    ContestRegistration.countDocuments({ contest: contest._id }),
  ]);

  res.json({
    leaderboard: registrations,
    contestProblems: contest.problems,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─── In-contest Submission ────────────────────────────────────────────────────

const submitToContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });
  if (contest.status !== 'live') {
    return res.status(400).json({ message: `Contest is not live (status: ${contest.status})` });
  }

  const registration = await ContestRegistration.findOne({ contest: contest._id, user: req.user.id });
  if (!registration) {
    return res.status(403).json({ message: 'You must be registered to submit to this contest' });
  }

  const { problemLabel, language, sourceCode } = req.body;
  if (!language || !sourceCode) {
    return res.status(400).json({ message: 'language and sourceCode are required' });
  }
  if (!problemLabel) {
    return res.status(400).json({ message: 'problemLabel is required (e.g. "A", "B")' });
  }

  // Find the problem within this contest by its label
  const contestProblem = contest.problems.find(
    (p) => p.label.toUpperCase() === String(problemLabel).toUpperCase()
  );
  if (!contestProblem) {
    return res.status(404).json({ message: `Problem "${problemLabel}" not found in this contest` });
  }

  const problem = await Problem.findById(contestProblem.problem);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const submission = await Submission.create({
    submissionId: `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    user: req.user.id,
    problem: problem._id,
    problemTitle: problem.title,
    contest: contest._id,
    language,
    sourceCode,
    totalTestcases: problem.testCases.length,
    verdict: 'Pending',
    submittedAt: new Date(),
  });

  const [judgeJob] = await Promise.all([
    JudgeJob.create({ submission: submission._id }),
    Problem.findByIdAndUpdate(problem._id, { $inc: { totalSubmissions: 1 } }),
  ]);
  await enqueueJudgeJob(judgeJob._id, { priority: judgeJob.priority });

  res.status(201).json({ submission });
});

// ─── My Contest Submissions ───────────────────────────────────────────────────

const getMyContestSubmissions = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id)).select('_id');
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  const submissions = await Submission.find({ contest: contest._id, user: req.user.id })
    .select('-sourceCode')
    .populate('problem', 'problemId slug title difficulty')
    .sort({ submittedAt: -1 });

  res.json({ submissions });
});

// ─── Admin: Finalize ──────────────────────────────────────────────────────────

const adminFinalizeContest = asyncHandler(async (req, res) => {
  const contest = await Contest.findOne(contestLookup(req.params.id));
  if (!contest) return res.status(404).json({ message: 'Contest not found' });

  if (contest.status !== 'ended') {
    // Allow admin to force-end and finalize
    await Contest.findByIdAndUpdate(contest._id, { status: 'ended' });
  }

  const processed = await finalizeContest(contest._id);
  res.json({ message: processed ? 'Contest finalized and ratings updated' : 'Already finalized', processed });
});

module.exports = {
  listContests,
  getContest,
  createContest,
  updateContest,
  deleteContest,
  registerForContest,
  contestLeaderboard,
  submitToContest,
  getMyContestSubmissions,
  adminFinalizeContest,
};
