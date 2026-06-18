const Problem = require('../models/problem');

// Recompute the stored acceptance percentage from the two counters. Used as the
// second stage of the update pipeline below and by the backfill script.
const acceptanceStage = {
  $set: {
    acceptance: {
      $cond: [
        { $gt: ['$totalSubmissions', 0] },
        {
          $round: [
            { $multiply: [{ $divide: ['$acceptedSubmissions', '$totalSubmissions'] }, 100] },
            0,
          ],
        },
        0,
      ],
    },
  },
};

// Atomically bump the submission counters and recompute `acceptance`
// (acceptedSubmissions / totalSubmissions as a 0-100 percentage) in a single
// update, so the displayed acceptance rate always stays in sync.
const bumpProblemStats = (problemId, { total = 0, accepted = 0 } = {}) =>
  Problem.findByIdAndUpdate(problemId, [
    {
      $set: {
        totalSubmissions: { $add: [{ $ifNull: ['$totalSubmissions', 0] }, total] },
        acceptedSubmissions: { $add: [{ $ifNull: ['$acceptedSubmissions', 0] }, accepted] },
      },
    },
    acceptanceStage,
  ]);

module.exports = { bumpProblemStats, acceptanceStage };
