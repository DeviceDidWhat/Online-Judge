const crypto = require('crypto');
const Problem = require('../models/problem');
const TestCase = require('../models/testCase');
const Submission = require('../models/submission');
const JudgeJob = require('../models/judgeJob');
const Contest = require('../models/contest');
const { asyncHandler, parsePagination, isObjectId, sourceCodeTooLarge, MAX_SOURCE_CODE_BYTES } = require('../utils/controller');
const { applySubmissionResult } = require('../services/submissionResultService');
const { enqueueJudgeJob } = require('../services/judgeQueue');
const { bumpProblemStats } = require('../utils/problemStats');

const canAccessSubmission = (req, submission) => {
  if (req.user.role === 'admin') return true;
  // `submission.user` may be a populated User document (then its _id is the owner)
  // or a raw ObjectId. Normalise both to the id string before comparing.
  const ownerId = submission.user?._id ?? submission.user;
  return ownerId != null && ownerId.toString() === req.user.id;
};

const listSubmissions = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { limit: 20 });
  const filter = req.user.role === 'admin' && req.query.all === 'true' ? {} : { user: req.user.id };

  if (req.query.verdict) filter.verdict = req.query.verdict;
  if (req.query.language) filter.language = req.query.language;
  if (req.query.problem) {
    const problem = await Problem.findOne({ $or: [{ slug: req.query.problem }, { problemId: Number(req.query.problem) || -1 }] }).select('_id');
    if (problem) filter.problem = problem._id;
  }

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      // The list view only needs verdict/metrics — exclude the heavy per-testcase
      // fields (which can be megabytes for large inputs) so the list loads fast.
      .select('-sourceCode -testcaseResults -failedTestcase -stdout -stderr -compileOutput')
      .populate('user', 'username avatar')
      .populate('problem', 'problemId slug title difficulty')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit),
    Submission.countDocuments(filter),
  ]);

  res.json({ submissions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const createSubmission = asyncHandler(async (req, res) => {
  const { problemSlug, problemId, problem, language, sourceCode } = req.body;
  if (!language || !sourceCode) return res.status(400).json({ message: 'Language and sourceCode are required' });
  if (sourceCodeTooLarge(sourceCode)) {
    return res.status(413).json({ message: `Source code exceeds the ${Math.floor(MAX_SOURCE_CODE_BYTES / 1024)} KB limit` });
  }

  const problemQuery = [
    ...(problem && isObjectId(problem) ? [{ _id: problem }] : []),
    ...(problemSlug ? [{ slug: problemSlug }] : []),
    ...(problemId ? [{ problemId: Number(problemId) }] : []),
  ];
  if (problemQuery.length === 0) return res.status(400).json({ message: 'A problem identifier is required' });

  const foundProblem = await Problem.findOne({ $or: problemQuery });
  if (!foundProblem) return res.status(404).json({ message: 'Problem not found' });
  if (foundProblem.status !== 'published' && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Problem is not available for submissions' });
  }

  // A problem that is part of a currently-live contest must only be submitted
  // through the contest endpoint (POST /contests/:id/submit), so the attempt is
  // scored against the contest and registration is enforced. Block the normal
  // path during the live window; upsolving via this endpoint is fine once the
  // contest has ended. Admins are exempt (testing/rejudge).
  if (req.user.role !== 'admin') {
    const inLiveContest = await Contest.exists({ 'problems.problem': foundProblem._id, status: 'live' });
    if (inLiveContest) {
      return res.status(403).json({ message: 'This problem is part of a live contest — submit through the contest.' });
    }
  }

  const totalTestcases = await TestCase.countDocuments({ problem: foundProblem._id });
  // Acceptance is counted per-user, not per-submission: only the user's FIRST
  // attempt at this problem bumps the total, so resubmitting (including the same
  // correct code repeatedly) never inflates the rate. Checked before create so
  // the new submission isn't what we detect.
  const isFirstAttempt = !(await Submission.exists({ user: req.user.id, problem: foundProblem._id }));
  const submission = await Submission.create({
    submissionId: `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    user: req.user.id,
    problem: foundProblem._id,
    problemTitle: foundProblem.title,
    language,
    sourceCode,
    totalTestcases,
    verdict: 'Pending',
  });

  const tasks = [JudgeJob.create({ submission: submission._id })];
  if (isFirstAttempt) tasks.push(bumpProblemStats(foundProblem._id, { total: 1 }));
  const [judgeJob] = await Promise.all(tasks);
  // A failed enqueue must not orphan the submission. It stays Pending and the
  // judge worker's periodic recovery sweep (services/judgeRecovery.js) re-enqueues
  // it, so we still acknowledge the submission instead of surfacing a 500.
  try {
    await enqueueJudgeJob(judgeJob._id, { priority: judgeJob.priority });
  } catch (err) {
    console.error('[createSubmission] enqueue failed; recovery will retry:', err.message);
  }

  res.status(201).json({ submission });
});

const getSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({ submissionId: req.params.id })
    .populate('user', 'username avatar')
    .populate('problem', 'problemId slug title difficulty');
  if (!submission) return res.status(404).json({ message: 'Submission not found' });
  if (!canAccessSubmission(req, submission)) return res.status(403).json({ message: 'Access denied' });

  // Safety net for submissions judged before hidden-case data was sanitized at
  // write time: if a failed case is not explicitly marked visible, strip its data.
  const ft = submission.failedTestcase;
  if (ft && ft.hidden !== false && (ft.input || ft.expectedOutput || ft.actualOutput)) {
    ft.input = undefined;
    ft.expectedOutput = undefined;
    ft.actualOutput = undefined;
    ft.hidden = true;
  }

  res.json({ submission });
});

const updateSubmissionResult = asyncHandler(async (req, res) => {
  const submission = await applySubmissionResult(req.params.id, req.body);
  if (!submission) return res.status(404).json({ message: 'Submission not found' });

  res.json({ submission });
});

module.exports = { listSubmissions, createSubmission, getSubmission, updateSubmissionResult };
