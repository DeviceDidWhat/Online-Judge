const Problem = require('../models/problem');
const Contest = require('../models/contest');
const UserProblemProgress = require('../models/userProblemProgress');
const { asyncHandler, parsePagination, escapeRegExp } = require('../utils/controller');

// Returns true if the problem is accessible in a live or ended contest
const isAccessibleViaContest = (problemId) =>
  Contest.exists({ 'problems.problem': problemId, status: { $in: ['live', 'ended'] } });

const publicProblemSelect = '-testCases -editorial';

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const addUserProgress = async (problems, userId) => {
  if (!userId || problems.length === 0) return problems.map((problem) => problem.toObject());

  const ids = problems.map((problem) => problem._id);
  const progressRows = await UserProblemProgress.find({ user: userId, problem: { $in: ids } });
  const byProblem = new Map(progressRows.map((row) => [row.problem.toString(), row]));

  return problems.map((problem) => {
    const data = problem.toObject();
    const progress = byProblem.get(problem._id.toString());
    data.solved = progress?.status === 'solved';
    data.progress = progress ? {
      status: progress.status,
      bookmarked: progress.bookmarked,
      attempts: progress.attempts,
      solvedAt: progress.solvedAt,
    } : { status: 'unsolved', bookmarked: false, attempts: 0 };
    return data;
  });
};

const listProblems = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 30 });
  const filter = {};

  if (req.query.status) {
    filter.status = req.query.status;
  } else if (req.user?.role !== 'admin') {
    filter.status = 'published';
  }
  if (req.user?.role !== 'admin') {
    filter.visibility = { $ne: 'contest_only' };
  }
  if (req.query.difficulty) filter.difficulty = req.query.difficulty;
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.q) {
    const regex = new RegExp(escapeRegExp(req.query.q), 'i');
    filter.$or = [{ title: regex }, { slug: regex }, { tags: regex }];
  }

  const select = req.user?.role === 'admin' ? '' : publicProblemSelect;
  const [problems, total] = await Promise.all([
    Problem.find(filter).select(select).sort({ problemId: 1 }).skip(skip).limit(limit),
    Problem.countDocuments(filter),
  ]);

  res.json({
    problems: await addUserProgress(problems, req.user?.id),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

const getProblem = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  const select = isAdmin ? '' : publicProblemSelect;
  const problem = await Problem.findOne({ slug: req.params.slug }).select(select);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });
  if (problem.status !== 'published' && !isAdmin) {
    return res.status(404).json({ message: 'Problem not found' });
  }
  if (problem.visibility === 'contest_only' && !isAdmin) {
    const accessible = await isAccessibleViaContest(problem._id);
    if (!accessible) return res.status(404).json({ message: 'Problem not found' });
  }

  const [payload] = await addUserProgress([problem], req.user?.id);
  res.json({ problem: payload });
});

const createProblem = asyncHandler(async (req, res) => {
  const problemId = req.body.problemId || ((await Problem.findOne({}).sort({ problemId: -1 }).select('problemId'))?.problemId || 0) + 1;
  const slug = req.body.slug || slugify(req.body.title);
  if (!slug) return res.status(400).json({ message: 'A title or slug is required' });

  const problem = await Problem.create({
    ...req.body,
    problemId,
    slug,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(201).json({ problem });
});

const updateProblem = asyncHandler(async (req, res) => {
  const problem = await Problem.findOneAndUpdate(
    { slug: req.params.slug },
    { ...req.body, updatedBy: req.user.id },
    { new: true, runValidators: true }
  );
  if (!problem) return res.status(404).json({ message: 'Problem not found' });
  res.json({ problem });
});

const deleteProblem = asyncHandler(async (req, res) => {
  const problem = await Problem.findOneAndDelete({ slug: req.params.slug });
  if (!problem) return res.status(404).json({ message: 'Problem not found' });
  res.json({ message: 'Problem deleted' });
});

const getProblemProgress = asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ slug: req.params.slug }).select('_id');
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const progress = await UserProblemProgress.findOne({ user: req.user.id, problem: problem._id });
  res.json({ progress: progress || { status: 'unsolved', bookmarked: false, attempts: 0, savedCode: [] } });
});

const toggleBookmark = asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ slug: req.params.slug }).select('_id');
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const bookmarked = typeof req.body.bookmarked === 'boolean' ? req.body.bookmarked : true;
  const progress = await UserProblemProgress.findOneAndUpdate(
    { user: req.user.id, problem: problem._id },
    { $set: { bookmarked }, $setOnInsert: { user: req.user.id, problem: problem._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({ progress });
});

const saveCode = asyncHandler(async (req, res) => {
  const { language, code = '' } = req.body;
  if (!language) return res.status(400).json({ message: 'Language is required' });

  const problem = await Problem.findOne({ slug: req.params.slug }).select('_id');
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  let progress = await UserProblemProgress.findOne({ user: req.user.id, problem: problem._id });
  if (!progress) progress = new UserProblemProgress({ user: req.user.id, problem: problem._id });

  const saved = progress.savedCode.find((item) => item.language === language);
  if (saved) {
    saved.code = code;
    saved.updatedAt = new Date();
  } else {
    progress.savedCode.push({ language, code, updatedAt: new Date() });
  }

  await progress.save();
  res.json({ progress });
});

const runCustom = asyncHandler(async (req, res) => {
  const { language, sourceCode, input = '' } = req.body;
  if (!language || !sourceCode) return res.status(400).json({ message: 'Language and sourceCode are required' });

  const problem = await Problem.findOne({ slug: req.params.slug }).select('timeLimitMs memoryLimitMb visibility status');
  if (!problem) return res.status(404).json({ message: 'Problem not found' });
  if (problem.status !== 'published' && req.user?.role !== 'admin') {
    return res.status(404).json({ message: 'Problem not found' });
  }
  if (problem.visibility === 'contest_only' && req.user?.role !== 'admin') {
    const accessible = await isAccessibleViaContest(problem._id);
    if (!accessible) return res.status(404).json({ message: 'Problem not found' });
  }

  const judgeRunner = require('../services/judgeRunner');
  const result = await judgeRunner.runCode({
    language,
    sourceCode,
    input,
    timeLimitMs: problem.timeLimitMs || 1000,
    memoryLimitMb: problem.memoryLimitMb || 256,
  });

  res.json({ result });
});

module.exports = {
  listProblems,
  getProblem,
  createProblem,
  updateProblem,
  deleteProblem,
  getProblemProgress,
  toggleBookmark,
  saveCode,
  runCustom,
};
