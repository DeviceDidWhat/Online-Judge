const Problem = require('../models/problem');
const Contest = require('../models/contest');
const aiService = require('../services/aiService');
const { asyncHandler } = require('../utils/controller');

const MAX_CODE_CHARS = 60000;

const resolveProblem = (problemSlug) => {
  const query = [{ slug: String(problemSlug).toLowerCase() }];
  if (/^\d+$/.test(String(problemSlug))) query.push({ problemId: Number(problemSlug) });
  return Problem.findOne({ $or: query });
};

// Shared validation + the "no AI during a live contest" guard. Returns the loaded
// problem, or null after sending the appropriate error response.
const loadAndGuard = async (req, res) => {
  const { problemSlug, code, language } = req.body;
  if (!problemSlug || typeof code !== 'string' || !language) {
    res.status(400).json({ message: 'problemSlug, language and code are required' });
    return null;
  }
  if (code.length > MAX_CODE_CHARS) {
    res.status(413).json({ message: 'Code is too large for AI analysis' });
    return null;
  }
  const problem = await resolveProblem(problemSlug);
  if (!problem) {
    res.status(404).json({ message: 'Problem not found' });
    return null;
  }
  // AI assistance is only for practice — disabled while the problem is part of a
  // currently-live contest, to keep contests fair. Admins are exempt.
  if (req.user.role !== 'admin') {
    const inLiveContest = await Contest.exists({ 'problems.problem': problem._id, status: 'live' });
    if (inLiveContest) {
      res.status(403).json({ message: 'AI help is disabled while this problem is in a live contest.' });
      return null;
    }
  }
  return problem;
};

const runAi = (fn, key) => asyncHandler(async (req, res) => {
  const problem = await loadAndGuard(req, res);
  if (!problem) return;
  try {
    const result = await fn({ problem, language: req.body.language, code: req.body.code });
    res.json({ [key]: result });
  } catch (err) {
    res.status(err.status || 502).json({ message: err.message || 'AI request failed' });
  }
});

const review = runAi(aiService.reviewCode, 'review');
const hint = runAi(aiService.getHint, 'hint');

module.exports = { review, hint };
