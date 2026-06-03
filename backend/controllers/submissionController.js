const crypto = require('crypto');
const Problem = require('../models/problem');
const Submission = require('../models/submission');
const JudgeJob = require('../models/judgeJob');
const { asyncHandler, parsePagination, isObjectId } = require('../utils/controller');
const { applySubmissionResult } = require('../services/submissionResultService');

const canAccessSubmission = (req, submission) => (
  req.user.role === 'admin' || submission.user.toString() === req.user.id
);

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
      .select('-sourceCode')
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

  const submission = await Submission.create({
    submissionId: `sub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    user: req.user.id,
    problem: foundProblem._id,
    problemTitle: foundProblem.title,
    language,
    sourceCode,
    totalTestcases: foundProblem.testCases.length,
    verdict: 'Pending',
  });

  await Promise.all([
    JudgeJob.create({ submission: submission._id }),
    Problem.findByIdAndUpdate(foundProblem._id, { $inc: { totalSubmissions: 1 } }),
  ]);

  res.status(201).json({ submission });
});

const getSubmission = asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({ submissionId: req.params.id })
    .populate('user', 'username avatar')
    .populate('problem', 'problemId slug title difficulty');
  if (!submission) return res.status(404).json({ message: 'Submission not found' });
  if (!canAccessSubmission(req, submission)) return res.status(403).json({ message: 'Access denied' });
  res.json({ submission });
});

const updateSubmissionResult = asyncHandler(async (req, res) => {
  const submission = await applySubmissionResult(req.params.id, req.body);
  if (!submission) return res.status(404).json({ message: 'Submission not found' });

  res.json({ submission });
});

module.exports = { listSubmissions, createSubmission, getSubmission, updateSubmissionResult };
