const Submission = require('../models/submission');
const ContestRegistration = require('../models/contestRegistration');
const UserProblemProgress = require('../models/userProblemProgress');
const { updateProgressForSubmission } = require('../utils/problemProgress');
const { bumpProblemStats } = require('../utils/problemStats');
const { updateContestScore } = require('./contestService');
const { getIO } = require('../socket');

const RESULT_FIELDS = [
  'verdict',
  'runtime',
  'memory',
  'testcasesPassed',
  'totalTestcases',
  'stdout',
  'stderr',
  'compileOutput',
  'failedTestcase',
  'testcaseResults',
];

const pickResultFields = (payload) => RESULT_FIELDS.reduce((acc, field) => {
  if (Object.prototype.hasOwnProperty.call(payload, field)) acc[field] = payload[field];
  return acc;
}, {});

const applySubmissionResult = async (submissionId, result) => {
  const existing = await Submission.findOne(
    typeof submissionId === 'string' && submissionId.startsWith('sub_')
      ? { submissionId }
      : { _id: submissionId }
  );
  if (!existing) return null;

  const wasPending = existing.verdict === 'Pending';
  const wasAccepted = existing.verdict === 'Accepted';
  const update = {
    ...pickResultFields(result),
    judgedAt: new Date(),
  };

  const submission = await Submission.findByIdAndUpdate(existing._id, update, {
    new: true,
    runValidators: true,
  });

  if (submission.verdict === 'Accepted' && !wasAccepted) {
    // Count acceptance per-user: only the user's FIRST solve of this problem bumps
    // the accepted counter, so repeated correct submissions don't inflate the rate.
    // The progress doc still reflects the pre-this-submission state here, because
    // updateProgressForSubmission (below) runs after this.
    const alreadySolved = await UserProblemProgress.exists({
      user: submission.user,
      problem: submission.problem,
      status: 'solved',
    });
    if (!alreadySolved) {
      await bumpProblemStats(submission.problem, { accepted: 1 });
    }
  }

  if (wasPending) {
    await updateProgressForSubmission(submission);

    // ── Emit submission result to the submitting user via WebSocket ──────────
    try {
      const io = getIO();
      io.to(`user:${submission.user}`).emit('submission:result', {
        submissionId: submission.submissionId,
        verdict: submission.verdict,
        language: submission.language,
        submittedAt: submission.submittedAt,
        runtime: submission.runtime,
        memory: submission.memory,
        testcasesPassed: submission.testcasesPassed,
        totalTestcases: submission.totalTestcases,
        stdout: submission.stdout,
        stderr: submission.stderr,
        compileOutput: submission.compileOutput,
        failedTestcase: submission.failedTestcase,
        testcaseResults: submission.testcaseResults,
        judgedAt: submission.judgedAt,
      });
    } catch {
      // Socket not available (e.g. standalone worker process) — skip silently.
    }

    // If this submission belongs to a contest, recompute the contest leaderboard score.
    // Runs on every judged contest submission (AC or wrong) so penalties settle
    // correctly regardless of the order the judge finishes submissions in.
    if (submission.contest) {
      await updateContestScore(
        submission.contest,
        submission.user,
        submission.problem
      );

      // ── Broadcast refreshed leaderboard to contest room ──────────────────
      try {
        const io = getIO();
        const leaderboard = await ContestRegistration.find({ contest: submission.contest })
          .populate('user', 'username avatar rating')
          .sort({ score: -1, penalty: 1, lastSolveAt: 1 });
        io.to(`contest:${submission.contest}`).emit('contest:leaderboard', {
          contestId: String(submission.contest),
          leaderboard,
        });
      } catch {
        // Socket not available — skip silently.
      }
    }
  }

  return submission;
};

module.exports = { applySubmissionResult };
