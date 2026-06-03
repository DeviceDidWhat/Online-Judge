const User = require('../models/user');
const Problem = require('../models/problem');
const UserActivity = require('../models/userActivity');
const UserProblemProgress = require('../models/userProblemProgress');

const startOfDay = (date = new Date()) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const updateProgressForSubmission = async (submission) => {
  const problem = await Problem.findById(submission.problem).select('difficulty');
  if (!problem) return null;

  const accepted = submission.verdict === 'Accepted';
  const existing = await UserProblemProgress.findOne({ user: submission.user, problem: submission.problem });
  const wasSolved = existing?.status === 'solved';

  const update = {
    $inc: { attempts: 1 },
    $set: {
      lastSubmission: submission._id,
      status: accepted ? 'solved' : (wasSolved ? 'solved' : 'attempted'),
    },
    $setOnInsert: { user: submission.user, problem: submission.problem },
  };

  if (accepted) {
    update.$set.bestSubmission = submission._id;
    if (!wasSolved) update.$set.solvedAt = submission.submittedAt || new Date();
  }

  const progress = await UserProblemProgress.findOneAndUpdate(
    { user: submission.user, problem: submission.problem },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await UserActivity.findOneAndUpdate(
    { user: submission.user, date: startOfDay(submission.submittedAt || new Date()) },
    { $inc: { count: 1 }, $setOnInsert: { user: submission.user, date: startOfDay(submission.submittedAt || new Date()) } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (accepted && !wasSolved) {
    const key = problem.difficulty.toLowerCase();
    await User.findByIdAndUpdate(submission.user, {
      $inc: {
        [`solved.${key}`]: 1,
        'solved.total': 1,
      },
    });
  }

  return progress;
};

module.exports = { updateProgressForSubmission, startOfDay };
