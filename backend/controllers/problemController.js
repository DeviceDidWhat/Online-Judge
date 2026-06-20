const Problem = require('../models/problem');
const Contest = require('../models/contest');
const TestCase = require('../models/testCase');
const UserProblemProgress = require('../models/userProblemProgress');
const { asyncHandler, parsePagination, escapeRegExp, isObjectId, sourceCodeTooLarge, MAX_SOURCE_CODE_BYTES } = require('../utils/controller');
const Semaphore = require('../utils/semaphore');

// The "Run" button executes arbitrary code in Docker synchronously in the API
// process (it does NOT go through the judge queue). Without a cap, concurrent
// requests would spawn unbounded containers and exhaust the host. Limit how many
// run at once and shed excess load with a 503 rather than queueing without bound.
const RUN_CONCURRENCY = Number(process.env.JUDGE_RUN_CONCURRENCY || 2);
const RUN_MAX_PENDING = Number(process.env.JUDGE_RUN_MAX_PENDING || 10);
const runSemaphore = new Semaphore(RUN_CONCURRENCY, RUN_MAX_PENDING);

// Returns true if the problem is accessible in a live or ended contest
const isAccessibleViaContest = (problemId) =>
  Contest.exists({ 'problems.problem': problemId, status: { $in: ['live', 'ended'] } });

// editorial is the only large embedded field left on Problem; test cases now live
// in their own collection (models/testCase.js).
const publicProblemSelect = '-editorial';

// Replace the full set of test cases for a problem (used by create/update). Stored
// out-of-document so large inputs/outputs never bloat the Problem document.
const replaceTestCases = async (problemId, testCases) => {
  await TestCase.deleteMany({ problem: problemId });
  if (Array.isArray(testCases) && testCases.length > 0) {
    await TestCase.insertMany(testCases.map((tc, index) => ({
      problem: problemId,
      order: typeof tc.order === 'number' ? tc.order : index + 1,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      hidden: tc.hidden ?? true,
    })));
  }
};

// Attach a `testCaseCount` to each (plain-object) problem in one aggregate query,
// so the admin list can show counts without embedding the cases.
const attachTestCaseCounts = async (problems) => {
  if (problems.length === 0) return problems;
  const ids = problems.map((problem) => problem._id);
  const counts = await TestCase.aggregate([
    { $match: { problem: { $in: ids } } },
    { $group: { _id: '$problem', count: { $sum: 1 } } },
  ]);
  const byProblem = new Map(counts.map((row) => [String(row._id), row.count]));
  problems.forEach((problem) => { problem.testCaseCount = byProblem.get(String(problem._id)) || 0; });
  return problems;
};

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
  const isAdmin = req.user?.role === 'admin';
  const filter = {};
  // Conditions that must all hold, collected here so the visibility OR and the
  // search OR can be combined safely via $and (two bare $or keys would clobber).
  const and = [];

  if (req.query.status) {
    filter.status = req.query.status;
  } else if (!isAdmin) {
    filter.status = 'published';
  }
  if (!isAdmin) {
    // Contest-only problems are hidden from the general list until the contest
    // they belonged to has ended — after that they become regular practice
    // problems that everyone can browse. (The detail page already grants access
    // for ended contests via isAccessibleViaContest.)
    const endedContestProblemIds = await Contest.distinct('problems.problem', { status: 'ended' });
    and.push({
      $or: [
        { visibility: { $ne: 'contest_only' } },
        { visibility: 'contest_only', _id: { $in: endedContestProblemIds } },
      ],
    });
  }
  if (req.query.difficulty) filter.difficulty = req.query.difficulty;
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.q) {
    const regex = new RegExp(escapeRegExp(req.query.q), 'i');
    and.push({ $or: [{ title: regex }, { slug: regex }, { tags: regex }] });
  }
  if (and.length) filter.$and = and;

  const select = isAdmin ? '' : publicProblemSelect;
  const [problems, total] = await Promise.all([
    Problem.find(filter).select(select).sort({ problemId: 1 }).skip(skip).limit(limit),
    Problem.countDocuments(filter),
  ]);

  const withProgress = await addUserProgress(problems, req.user?.id);
  if (req.user?.role === 'admin') await attachTestCaseCounts(withProgress);

  res.json({
    problems: withProgress,
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
  // Admins editing a problem need the full test-case set to populate the form.
  if (isAdmin) {
    payload.testCases = await TestCase.find({ problem: problem._id }).sort({ order: 1 }).lean();
  }
  res.json({ problem: payload });
});

const createProblem = asyncHandler(async (req, res) => {
  const problemId = req.body.problemId || ((await Problem.findOne({}).sort({ problemId: -1 }).select('problemId'))?.problemId || 0) + 1;
  const slug = req.body.slug || slugify(req.body.title);
  if (!slug) return res.status(400).json({ message: 'A title or slug is required' });

  const { testCases, ...problemFields } = req.body;
  const problem = await Problem.create({
    ...problemFields,
    problemId,
    slug,
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  await replaceTestCases(problem._id, testCases);

  const payload = problem.toObject();
  payload.testCaseCount = Array.isArray(testCases) ? testCases.length : 0;
  res.status(201).json({ problem: payload });
});

const updateProblem = asyncHandler(async (req, res) => {
  const { testCases, ...problemFields } = req.body;
  const problem = await Problem.findOneAndUpdate(
    { slug: req.params.slug },
    { ...problemFields, updatedBy: req.user.id },
    { new: true, runValidators: true }
  );
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  // Only touch test cases when the client actually sent them.
  if (Array.isArray(testCases)) await replaceTestCases(problem._id, testCases);

  const payload = problem.toObject();
  payload.testCaseCount = await TestCase.countDocuments({ problem: problem._id });
  res.json({ problem: payload });
});

const deleteProblem = asyncHandler(async (req, res) => {
  const problem = await Problem.findOneAndDelete({ slug: req.params.slug });
  if (!problem) return res.status(404).json({ message: 'Problem not found' });
  await TestCase.deleteMany({ problem: problem._id });
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
  if (sourceCodeTooLarge(sourceCode)) {
    return res.status(413).json({ message: `Source code exceeds the ${Math.floor(MAX_SOURCE_CODE_BYTES / 1024)} KB limit` });
  }

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
  let result;
  try {
    result = await runSemaphore.run(() => judgeRunner.runCode({
      language,
      sourceCode,
      input,
      timeLimitMs: problem.timeLimitMs || 1000,
      memoryLimitMb: problem.memoryLimitMb || 256,
    }));
  } catch (err) {
    if (err.code === 'CAPACITY') {
      res.setHeader('Retry-After', '5');
      return res.status(503).json({ message: 'The runner is busy right now. Please try again in a moment.' });
    }
    throw err;
  }

  res.json({ result });
});

// ─── Test case management (admin) ──────────────────────────────────────────────
// These operate on individual test cases in the standalone collection, so admins
// can add/edit/remove cases on an existing problem without rewriting the whole set.

const findProblemBySlug = (slug) => Problem.findOne({ slug }).select('_id');

const listTestCases = asyncHandler(async (req, res) => {
  const problem = await findProblemBySlug(req.params.slug);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const testCases = await TestCase.find({ problem: problem._id }).sort({ order: 1 }).lean();
  res.json({ testCases });
});

// Append one or more test cases. Accepts either { testCases: [...] } or a single
// { input, expectedOutput, hidden } body. Existing cases are left untouched and the
// new ones are assigned order numbers continuing from the current maximum.
const addTestCases = asyncHandler(async (req, res) => {
  const problem = await findProblemBySlug(req.params.slug);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const incoming = Array.isArray(req.body.testCases)
    ? req.body.testCases
    : (req.body.input !== undefined || req.body.expectedOutput !== undefined ? [req.body] : []);

  const valid = incoming.filter((tc) =>
    tc && typeof tc.input === 'string' && tc.input.length > 0
    && typeof tc.expectedOutput === 'string' && tc.expectedOutput.length > 0);

  if (valid.length === 0) {
    return res.status(400).json({ message: 'At least one test case with non-empty input and expectedOutput is required' });
  }

  const last = await TestCase.findOne({ problem: problem._id }).sort({ order: -1 }).select('order').lean();
  let nextOrder = (last?.order || 0) + 1;

  const created = await TestCase.insertMany(valid.map((tc) => ({
    problem: problem._id,
    order: nextOrder++,
    input: tc.input,
    expectedOutput: tc.expectedOutput,
    hidden: tc.hidden ?? true,
  })));

  const testCaseCount = await TestCase.countDocuments({ problem: problem._id });
  res.status(201).json({ testCases: created, testCaseCount });
});

const updateTestCase = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.testCaseId)) return res.status(404).json({ message: 'Test case not found' });
  const problem = await findProblemBySlug(req.params.slug);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const updates = {};
  ['input', 'expectedOutput', 'hidden', 'order'].forEach((key) => {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  });

  const testCase = await TestCase.findOneAndUpdate(
    { _id: req.params.testCaseId, problem: problem._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!testCase) return res.status(404).json({ message: 'Test case not found' });
  res.json({ testCase });
});

const deleteTestCase = asyncHandler(async (req, res) => {
  if (!isObjectId(req.params.testCaseId)) return res.status(404).json({ message: 'Test case not found' });
  const problem = await findProblemBySlug(req.params.slug);
  if (!problem) return res.status(404).json({ message: 'Problem not found' });

  const deleted = await TestCase.findOneAndDelete({ _id: req.params.testCaseId, problem: problem._id });
  if (!deleted) return res.status(404).json({ message: 'Test case not found' });

  const testCaseCount = await TestCase.countDocuments({ problem: problem._id });
  res.json({ message: 'Test case deleted', testCaseCount });
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
  listTestCases,
  addTestCases,
  updateTestCase,
  deleteTestCase,
};
